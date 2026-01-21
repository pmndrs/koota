import { createActions } from 'koota';
import { type Op } from './types';
import { History } from '../traits';
import { applyOp } from './apply';
import { invertOp } from './invert';
import { emitCommit } from '../multiplayer/commit-sink';

export const historyActions = createActions((world) => ({
    push: (op: Op) => {
        const history = world.get(History)!;
        history.pending.push(op);
    },

    commit: () => {
        const history = world.get(History)!;
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
    },

    undo: () => {
        const history = world.get(History)!;
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
        const history = world.get(History)!;
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
}));
