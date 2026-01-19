import { createActions, type Entity } from 'koota';
import { Shape, Position, Rotation, Scale, Color, IsSelected, History, StableId } from './traits';
import { historyActions } from './ops/history-actions';
import { OpCode, SEQ_UNASSIGNED } from './ops/types';

export const actions = createActions((world) => {
    const { push, commit, undo, redo, canUndo, canRedo } = historyActions(world);

    return {
        addShape: (type: 'rect' | 'ellipse', x: number, y: number) => {
            const history = world.get(History)!;
            const color = '#4a90d9';
            const rotation = 0;
            const scaleX = 1;
            const scaleY = 1;

            // Assign stable ID
            const id = history.nextId++;

            const entity = world.spawn(
                StableId({ id }),
                Shape({ type }),
                Position({ x, y }),
                Rotation({ angle: rotation }),
                Scale({ x: scaleX, y: scaleY }),
                Color({ fill: color })
            );

            // Register entity in map
            history.entities.set(id, entity);

            push({
                op: OpCode.CreateShape,
                id,
                seq: SEQ_UNASSIGNED,
                shape: type,
                x,
                y,
                color,
                rotation,
                scaleX,
                scaleY,
            });
            commit(); // Immediate commit for discrete actions

            return entity;
        },

        selectShape: (entity: Entity, additive = false) => {
            if (additive) {
                // Shift-click: toggle selection for multi-select
                if (entity.has(IsSelected)) {
                    entity.remove(IsSelected);
                } else {
                    entity.add(IsSelected);
                }
            } else {
                // Regular click: select this shape, clear others
                for (const selected of world.query(IsSelected)) {
                    if (selected.id() !== entity.id()) {
                        selected.remove(IsSelected);
                    }
                }
                // Ensure this entity is selected (don't toggle)
                if (!entity.has(IsSelected)) {
                    entity.add(IsSelected);
                }
            }
        },

        clearSelection: () => {
            for (const entity of world.query(IsSelected)) {
                entity.remove(IsSelected);
            }
        },

        deleteSelected: () => {
            const selected = Array.from(world.query(IsSelected));
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/49ce6d5d-d793-4697-b0bb-8d91097dbd1f', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    location: 'actions.ts:72',
                    message: 'deleteSelected called',
                    data: { selectedCount: selected.length },
                    timestamp: Date.now(),
                    sessionId: 'debug-session',
                    hypothesisId: 'C',
                }),
            }).catch(() => {});
            // #endregion

            for (const entity of selected) {
                const stableId = entity.get(StableId);
                const shape = entity.get(Shape);
                const position = entity.get(Position);
                const rotation = entity.get(Rotation);
                const scale = entity.get(Scale);
                const color = entity.get(Color);

                if (stableId && shape && position && rotation && scale && color) {
                    push({
                        op: OpCode.DeleteShape,
                        id: stableId.id,
                        seq: SEQ_UNASSIGNED,
                        shape: shape.type,
                        x: position.x,
                        y: position.y,
                        color: color.fill,
                        rotation: rotation.angle,
                        scaleX: scale.x,
                        scaleY: scale.y,
                    });
                    entity.destroy();
                }
            }
            commit();
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/49ce6d5d-d793-4697-b0bb-8d91097dbd1f', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    location: 'actions.ts:96',
                    message: 'deleteSelected completed',
                    data: {},
                    timestamp: Date.now(),
                    sessionId: 'debug-session',
                    hypothesisId: 'C',
                }),
            }).catch(() => {});
            // #endregion
        },

        setSelectedColor: (fill: string) => {
            for (const entity of world.query(IsSelected, Color)) {
                const stableId = entity.get(StableId);
                const color = entity.get(Color)!;

                if (stableId) {
                    push({
                        op: OpCode.UpdateColor,
                        id: stableId.id,
                        seq: SEQ_UNASSIGNED,
                        fill,
                        prevFill: color.fill,
                    });
                    entity.set(Color, { fill });
                }
            }
            commit();
        },

        setSelectedRotation: (angle: number) => {
            for (const entity of world.query(IsSelected, Rotation)) {
                const stableId = entity.get(StableId);
                const rotation = entity.get(Rotation)!;

                if (stableId) {
                    push({
                        op: OpCode.UpdateRotation,
                        id: stableId.id,
                        seq: SEQ_UNASSIGNED,
                        angle,
                        prevAngle: rotation.angle,
                    });
                    entity.set(Rotation, { angle });
                }
            }
            commit();
        },

        setSelectedScale: (x: number, y: number) => {
            for (const entity of world.query(IsSelected, Scale)) {
                const stableId = entity.get(StableId);
                const scale = entity.get(Scale)!;

                if (stableId) {
                    push({
                        op: OpCode.UpdateScale,
                        id: stableId.id,
                        seq: SEQ_UNASSIGNED,
                        x,
                        y,
                        prevX: scale.x,
                        prevY: scale.y,
                    });
                    entity.set(Scale, { x, y });
                }
            }
            commit();
        },

        // Gesture management
        commitGesture: () => commit(),

        // Undo/redo
        undo,
        redo,
        canUndo,
        canRedo,
    };
});
