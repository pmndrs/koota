import { createActions, type Entity } from 'koota';
import { emitCommit } from '../multiplayer/commit-sink';
import { applyOp } from '../ops/apply';
import { invertOp } from '../ops/invert';
import { captureCurrentState } from '../ops/snapshot';
import { Color, History, Position, Rotation, Scale, StableId } from '../traits';
import { isActive } from '../utils/shape-helpers';
import { OpCode, SEQ_UNASSIGNED, type Op, type HistoryEntry } from '../types';

export const historyActions = createActions((world) => {
    const getHistory = () => world.get(History)!;

    // Check if an op targets a non-tombstoned (active) shape
    const isOpValid = (op: Op): boolean => {
        const history = getHistory();
        const entity = history.entities.get(op.id);
        if (!entity || !entity.isAlive()) return false;
        // CreateShape/DeleteShape are always valid (they change lifecycle)
        if (op.op === OpCode.CreateShape || op.op === OpCode.DeleteShape) return true;
        // Property updates are only valid if shape is active
        return isActive(entity);
    };

    // Check if an entry has any valid ops (at least one op targets an active shape)
    const isEntryValid = (entry: HistoryEntry): boolean => {
        return entry.restoreTo.some(isOpValid);
    };

    // Find the index of the first valid entry from the top of a stack
    const findFirstValidIndex = (stack: HistoryEntry[]): number => {
        for (let i = stack.length - 1; i >= 0; i--) {
            if (isEntryValid(stack[i])) return i;
        }
        return -1;
    };

    const pushOp = (op: Op) => {
        const history = getHistory();
        history.pending.push(op);
    };

    const commitPending = () => {
        const history = getHistory();
        if (history.pending.length === 0) return;

        // Assign sequence numbers to pending ops
        const intent = history.pending.map((op) => ({
            ...op,
            seq: history.nextSeq++,
        }));

        // Create restoreTo by inverting the intent ops
        // This restores to the state before the user's action
        const restoreTo = intent.map((op) => invertOp(op));

        history.undoStack.push({ intent, restoreTo });
        history.pending.length = 0;
        history.redoStack.length = 0; // Clear redo on new commit

        // Signal change to trigger reactive updates
        world.set(History, history);

        emitCommit(intent);
    };

    return {
        push: (op: Op) => {
            pushOp(op);
        },

        commit: () => {
            commitPending();
        },

        recordPositionChange: (
            entity: Entity,
            prev: { x: number; y: number },
            next: { x: number; y: number }
        ) => {
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
            const validIndex = findFirstValidIndex(history.undoStack);
            if (validIndex === -1) return;

            // Remove the valid entry from the stack
            const [entry] = history.undoStack.splice(validIndex, 1);

            // Capture current state BEFORE applying restoreTo
            // This becomes redo's restoreTo (preserves collaborator edits)
            const currentSnapshot: Op[] = [];
            for (const op of entry.intent) {
                const snapshot = captureCurrentState(world, op);
                if (snapshot) currentSnapshot.push(snapshot);
            }

            // Apply restoreTo ops (restore to state before user's action)
            const emitOps: Op[] = [];
            for (const op of entry.restoreTo) {
                const seqOp = { ...op, seq: history.nextSeq++ };
                emitOps.push(seqOp);
                applyOp(world, seqOp);
            }

            // Push to redo with updated restoreTo (current snapshot)
            history.redoStack.push({
                intent: entry.intent,
                restoreTo: currentSnapshot,
            });

            // Signal change to trigger reactive updates
            world.set(History, history);

            // Sync to server
            emitCommit(emitOps);
        },

        redo: () => {
            const history = getHistory();
            const validIndex = findFirstValidIndex(history.redoStack);
            if (validIndex === -1) return;

            // Remove the valid entry from the stack
            const [entry] = history.redoStack.splice(validIndex, 1);

            // Capture current state BEFORE applying restoreTo
            // This becomes undo's restoreTo
            const currentSnapshot: Op[] = [];
            for (const op of entry.intent) {
                const snapshot = captureCurrentState(world, op);
                if (snapshot) currentSnapshot.push(snapshot);
            }

            // Apply restoreTo ops (restore to state at undo time)
            const emitOps: Op[] = [];
            for (const op of entry.restoreTo) {
                const seqOp = { ...op, seq: history.nextSeq++ };
                emitOps.push(seqOp);
                applyOp(world, seqOp);
            }

            // Push to undo with updated restoreTo (current snapshot)
            history.undoStack.push({
                intent: entry.intent,
                restoreTo: currentSnapshot,
            });

            // Signal change to trigger reactive updates
            world.set(History, history);

            // Sync to server
            emitCommit(emitOps);
        },

        canUndo: () => {
            const history = world.get(History);
            if (!history) return false;
            return findFirstValidIndex(history.undoStack) !== -1;
        },

        canRedo: () => {
            const history = world.get(History);
            if (!history) return false;
            return findFirstValidIndex(history.redoStack) !== -1;
        },
    };
});
