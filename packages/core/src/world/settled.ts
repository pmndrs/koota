import type { WorldContext } from './types';

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
