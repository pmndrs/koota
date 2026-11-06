import type { WorldContext } from './types';

/**
 * Closes a structural operation opened by incrementing structuralDepth. Call it from a finally
 * block so a throwing operation still delivers the observers it queued.
 */
export /* @inline */ function endStructuralChanges(ctx: WorldContext) {
  if (--ctx.structuralDepth === 0 && ctx.settledQueue.size !== 0) settle(ctx);
}

/**
 * Runs queued observers until none remain. The depth is held while they run, so an observer
 * invalidated by one of them is queued and runs in a later pass.
 */
export function settle(ctx: WorldContext) {
  const queue = ctx.settledQueue;
  let failed = false;
  let failure: unknown;
  let passes = 0;
  let remaining = 0;
  ctx.structuralDepth++;
  try {
    // A Set visits entries added during iteration, so the loop ends only when the queue drains.
    for (const notify of queue) {
      if (remaining === 0) {
        if (++passes > 100) {
          queue.clear();
          throw new Error(
            'Koota: Settled observers did not settle after 100 passes. An observer is likely changing the state it observes.'
          );
        }
        remaining = queue.size;
      }
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
  } finally {
    ctx.structuralDepth--;
  }
  if (failed) throw failure;
}

/**
 * Experimental and hidden. Reached only as world[$internal].observeSettled, so framework hooks can
 * read world state once it is consistent. Invalidating during a structural operation defers the
 * update until the outermost operation ends, and several invalidations collapse into one update.
 * Outside one the update runs at once.
 */
export function observeSettled(this: WorldContext, update: () => void) {
  let active = true;
  const notify = () => {
    if (active) update();
  };
  return {
    invalidate: () => {
      if (this.structuralDepth === 0) notify();
      else this.settledQueue.add(notify);
    },
    unsubscribe: () => {
      active = false;
    },
  };
}
