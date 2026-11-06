import type { WorldContext } from './types';

export /* @inline */ function endStructuralChanges(ctx: WorldContext) {
  if (--ctx.structuralDepth === 0 && ctx.settledSubscriptions.size !== 0) requestSettlement(ctx);
}

export function requestSettlement(ctx: WorldContext) {
  ctx.settledPending = true;
  if (ctx.isSettling) return;
  ctx.isSettling = true;
  let failed = false;
  let failure: unknown;
  try {
    while (ctx.settledPending) {
      ctx.settledPending = false;
      for (const callback of ctx.settledSubscriptions) {
        try {
          callback();
        } catch (error) {
          if (!failed) {
            failed = true;
            failure = error;
          }
        }
      }
    }
    if (failed) throw failure;
  } finally {
    ctx.isSettling = false;
  }
}
