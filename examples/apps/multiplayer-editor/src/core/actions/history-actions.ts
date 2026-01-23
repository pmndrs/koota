import { createActions, type Entity } from 'koota';
import { OpCode, type Op, SEQ_UNASSIGNED } from '../ops/types';
import { Color, History, Position, Rotation, Scale, StableId } from '../traits';
import { applyOp } from '../ops/apply';
import { invertOp } from '../ops/invert';
import { emitCommit } from '../multiplayer/commit-sink';

export const historyActions = createActions((world) => {
    const getHistory = () => world.get(History)!;

    const pushOp = (op: Op) => {
        const history = getHistory();
        history.pending.push(op);
    };

    const commitPending = () => {
        const history = getHistory();
        if (history.pending.length === 0) return;

        // Assign sequence numbers to pending ops
        const batch = history.pending.map((op) => ({
            ...op,
            seq: history.nextSeq++,
        }));

        history.undoStack.push(batch);
        history.pending.length = 0;
        history.redoStack.length = 0; // Clear redo on new commit

        // Signal change to trigger reactive updates
        world.set(History, history);

        emitCommit(batch);
    };

    return {
        push: (op: Op) => {
            pushOp(op);
        },

        commit: () => {
            commitPending();
        },

        recordPositionChange: (entity: Entity, prev: { x: number; y: number }, next: { x: number; y: number }) => {
            if (prev.x === next.x && prev.y === next.y) return;
            if (!entity.has(Position)) return;
            const stableId = entity.get(StableId);
            if (!stableId) return;

            pushOp({
                op: OpCode.UpdatePosition,
                id: stableId.id,
                seq: SEQ_UNASSIGNED,
                x: next.x,
                y: next.y,
                prevX: prev.x,
                prevY: prev.y,
            });
            commitPending();
        },

        recordRotationChange: (entities: readonly Entity[], prevAngle: number, nextAngle: number) => {
            if (prevAngle === nextAngle) return;
            for (const entity of entities) {
                if (!entity.has(Rotation)) continue;
                const stableId = entity.get(StableId);
                if (!stableId) continue;
                pushOp({
                    op: OpCode.UpdateRotation,
                    id: stableId.id,
                    seq: SEQ_UNASSIGNED,
                    angle: nextAngle,
                    prevAngle,
                });
            }
            commitPending();
        },

        recordScaleXChange: (entities: readonly Entity[], prevX: number, nextX: number) => {
            if (prevX === nextX) return;
            for (const entity of entities) {
                const scale = entity.get(Scale);
                const stableId = entity.get(StableId);
                if (!scale || !stableId) continue;
                pushOp({
                    op: OpCode.UpdateScale,
                    id: stableId.id,
                    seq: SEQ_UNASSIGNED,
                    x: nextX,
                    y: scale.y,
                    prevX,
                    prevY: scale.y,
                });
            }
            commitPending();
        },

        recordScaleYChange: (entities: readonly Entity[], prevY: number, nextY: number) => {
            if (prevY === nextY) return;
            for (const entity of entities) {
                const scale = entity.get(Scale);
                const stableId = entity.get(StableId);
                if (!scale || !stableId) continue;
                pushOp({
                    op: OpCode.UpdateScale,
                    id: stableId.id,
                    seq: SEQ_UNASSIGNED,
                    x: scale.x,
                    y: nextY,
                    prevX: scale.x,
                    prevY,
                });
            }
            commitPending();
        },

        recordColorChange: (entities: readonly Entity[], prevFill: string, nextFill: string) => {
            if (prevFill === nextFill) return;
            for (const entity of entities) {
                if (!entity.has(Color)) continue;
                const stableId = entity.get(StableId);
                if (!stableId) continue;
                pushOp({
                    op: OpCode.UpdateColor,
                    id: stableId.id,
                    seq: SEQ_UNASSIGNED,
                    fill: nextFill,
                    prevFill,
                });
            }
            commitPending();
        },

        undo: () => {
            const history = getHistory();
            const batch = history.undoStack.pop();
            if (!batch) return;

            // Create inverted ops with new sequence numbers
            const invertedBatch: Op[] = [];
            for (let i = batch.length - 1; i >= 0; i--) {
                const invertedOp = { ...invertOp(batch[i]), seq: history.nextSeq++ };
                invertedBatch.push(invertedOp);
                applyOp(world, invertedOp);
            }

            history.redoStack.push(batch);

            // Signal change to trigger reactive updates
            world.set(History, history);

            // Sync undo to server
            emitCommit(invertedBatch);
        },

        redo: () => {
            const history = getHistory();
            const batch = history.redoStack.pop();
            if (!batch) return;

            // Create new ops with new sequence numbers for redo
            const redoBatch: Op[] = [];
            for (const op of batch) {
                const redoOp = { ...op, seq: history.nextSeq++ };
                redoBatch.push(redoOp);
                applyOp(world, redoOp);
            }

            history.undoStack.push(batch);

            // Signal change to trigger reactive updates
            world.set(History, history);

            // Sync redo to server
            emitCommit(redoBatch);
        },

        canUndo: () => {
            const history = world.get(History);
            return history ? history.undoStack.length > 0 : false;
        },

        canRedo: () => {
            const history = world.get(History);
            return history ? history.redoStack.length > 0 : false;
        },
    };
});
