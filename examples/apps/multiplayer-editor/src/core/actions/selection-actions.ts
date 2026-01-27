import { createActions, type Entity } from 'koota';
import { Color, IsSelected, Position, Rotation, Scale, Shape, StableId } from '../traits';
import { historyActions } from './history-actions';
import { OpCode, SEQ_UNASSIGNED } from '../types';

export const selectionActions = createActions((world) => {
    const { push, commit } = historyActions(world);

    return {
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
        },
    };
});
