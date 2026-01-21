import type { Op } from '../ops/types';

type CommitListener = (ops: Op[]) => void;

const listeners = new Set<CommitListener>();

export function addCommitListener(listener: CommitListener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

export function emitCommit(ops: Op[]) {
    for (const listener of listeners) {
        listener(ops);
    }
}
