import type { Op } from '../src/core/types';
import type { ServerState } from './state';
import { recordCheckpoint } from './state';

const MAX_JOURNAL_LENGTH = 500;

export function appendToJournal(state: ServerState, op: Op) {
    state.journal.push(op);
    if (state.journal.length > MAX_JOURNAL_LENGTH) {
        recordCheckpoint(state);
    }
}
