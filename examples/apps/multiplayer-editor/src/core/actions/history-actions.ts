import { createActions, type Entity } from 'koota';
import { emitCommit } from '../multiplayer/op-events';
import { applyOp } from '../ops/apply';
import { invertOp } from '../ops/invert';
import { captureCurrentState } from '../ops/snapshot';
import { Color, History, Position, Rotation, Scale, StableId } from '../traits';
import { isActive } from '../utils/shape-helpers';
import { OpCode, SEQ_UNASSIGNED, type Op, type HistoryEntry } from '../types';

export const historyActions = createActions((world) => {
    const getHistory = () => world.get(History)!;

    const isOpValid = (op: Op): boolean => {
        const history = getHistory();
        const entity = history.entities.get(op.id);
        if (!entity || !entity.isAlive()) return false;
        if (op.op === OpCode.CreateShape || op.op === OpCode.DeleteShape) return true;
        return isActive(entity);
    };

    const findFirstValidIndex = (stack: HistoryEntry[]): number => {
        for (let i = stack.length - 1; i >= 0; i--) {
            if (stack[i].restoreTo.some(isOpValid)) return i;
        }
        return -1;
    };

    const pushOp = (op: Op) => getHistory().pending.push(op);

    const commitPending = () => {
        const history = getHistory();
        if (history.pending.length === 0) return;

        const intent = history.pending.map((op) => ({ ...op, seq: history.nextSeq++ }));
        const restoreTo = intent.map(invertOp);

        history.undoStack.push({ intent, restoreTo });
        history.pending.length = 0;
        history.redoStack.length = 0;
        world.set(History, history);
        emitCommit(intent);
    };

    // Shared logic for undo/redo - they only differ in which stacks to use
    const applyHistoryAction = (fromStack: HistoryEntry[], toStack: HistoryEntry[]) => {
        const history = getHistory();
        const validIndex = findFirstValidIndex(fromStack);
        if (validIndex === -1) return;

        const [entry] = fromStack.splice(validIndex, 1);

        // Capture current state before applying (becomes the new restoreTo)
        const currentSnapshot = entry.intent
            .map((op) => captureCurrentState(world, op))
            .filter((op): op is Op => op !== null);

        // Apply restoreTo ops
        const emitOps = entry.restoreTo.map((op) => {
            const seqOp = { ...op, seq: history.nextSeq++ };
            applyOp(world, seqOp);
            return seqOp;
        });

        toStack.push({ intent: entry.intent, restoreTo: currentSnapshot });
        world.set(History, history);
        emitCommit(emitOps);
    };

    return {
        push: pushOp,
        commit: commitPending,

        recordPositionChange: (
            entity: Entity,
            prev: { x: number; y: number },
            next: { x: number; y: number }
        ) => {
            if (prev.x === next.x && prev.y === next.y) return;
            const stableId = entity.get(StableId);
            if (!stableId || !entity.has(Position)) return;

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
                const stableId = entity.get(StableId);
                if (!stableId || !entity.has(Rotation)) continue;
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

        recordScaleChange: (
            entities: readonly Entity[],
            axis: 'x' | 'y',
            prev: number,
            next: number
        ) => {
            if (prev === next) return;
            for (const entity of entities) {
                const scale = entity.get(Scale);
                const stableId = entity.get(StableId);
                if (!scale || !stableId) continue;
                pushOp({
                    op: OpCode.UpdateScale,
                    id: stableId.id,
                    seq: SEQ_UNASSIGNED,
                    x: axis === 'x' ? next : scale.x,
                    y: axis === 'y' ? next : scale.y,
                    prevX: axis === 'x' ? prev : scale.x,
                    prevY: axis === 'y' ? prev : scale.y,
                });
            }
            commitPending();
        },

        recordColorChange: (
            entities: readonly Entity[],
            prev: { r: number; g: number; b: number },
            next: { r: number; g: number; b: number }
        ) => {
            if (prev.r === next.r && prev.g === next.g && prev.b === next.b) return;
            for (const entity of entities) {
                const stableId = entity.get(StableId);
                if (!stableId || !entity.has(Color)) continue;
                pushOp({
                    op: OpCode.UpdateColor,
                    id: stableId.id,
                    seq: SEQ_UNASSIGNED,
                    r: next.r,
                    g: next.g,
                    b: next.b,
                    prevR: prev.r,
                    prevG: prev.g,
                    prevB: prev.b,
                });
            }
            commitPending();
        },

        undo: () => {
            const history = getHistory();
            applyHistoryAction(history.undoStack, history.redoStack);
        },

        redo: () => {
            const history = getHistory();
            applyHistoryAction(history.redoStack, history.undoStack);
        },

        canUndo: () => findFirstValidIndex(getHistory().undoStack) !== -1,
        canRedo: () => findFirstValidIndex(getHistory().redoStack) !== -1,
    };
});
