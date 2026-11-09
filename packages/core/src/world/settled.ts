import type { WorldContext } from './types';

/**
 * Runs the observers queued so far. settleWorld holds the defer scope and pass limit, so changes
 * and invalidations from these observers join a later pass. Every observer runs even if one throws.
 */
export function settle(ctx: WorldContext) {
  const queue = ctx.settledQueue;
  // A Set visits entries in insertion order, so the first size entries are the ones queued so far.
  let remaining = queue.size;
  let failed = false;
  let failure: unknown;
  for (const notify of queue) {
    if (remaining === 0) break;
    remaining--;
    queue.delete(notify);
    try {
      notify();
    } catch (error) {
      if (!failed) {
        failed = true;
        failure = error;
      }
    }
  }
  if (failed) throw failure;
}

/**
 * Experimental and hidden. Reached only as world[$internal].observeSettled, so framework hooks can
 * read world state once it is consistent. Invalidating inside a defer scope queues the update
 * until the outermost scope ends and its deferred changes have applied, and several invalidations
 * collapse into one update. Outside one the update runs at once.
 */
export function observeSettled(this: WorldContext, update: () => void) {
  let active = true;
  const notify = () => {
    if (active) update();
  };
  return {
    invalidate: () => {
      if (this.deferDepth === 0) notify();
      else {
        this.settledQueue.add(notify);
        this.unsettled = true;
      }
    },
    unsubscribe: () => {
      active = false;
    },
  };
}
