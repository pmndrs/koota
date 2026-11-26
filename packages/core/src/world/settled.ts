import type { WorldContext } from './types';

const $whenSettled = Symbol.for('koota.whenSettled');

/** Shared by subscriptions using one wrapper in one world. */
export type SettledCallback = {
  update: () => void;
  version: number;
  pending: number;
  queued: boolean;
};

/**
 * Wrap a hook callback to read the world once its pending structural changes have applied.
 * Reuse the same wrapper across subscriptions to coalesce their notifications per world.
 */
export function whenSettled(update: () => void): () => void {
  const callback = () => update();
  callback[$whenSettled] = update;
  return callback;
}

function isSettledHook(callback: object): callback is (() => void) & { [$whenSettled]: () => void } {
  return $whenSettled in callback;
}

/** Bind at registration so ordinary hooks keep their direct dispatch and event arguments. */
export function subscribeHook<Args extends unknown[]>(
  ctx: WorldContext,
  callback: (...args: Args) => void,
  subscribe: (listener: (...args: Args) => void) => () => void
): () => void {
  if (!isSettledHook(callback)) return subscribe(callback);
  const update = callback[$whenSettled];
  const callbacks = (ctx.settledCallbacks ??= new WeakMap());
  let settled = callbacks.get(callback);
  if (settled === undefined) {
    settled = { update, version: 0, pending: 0, queued: false };
    callbacks.set(callback, settled);
  }
  // Each subscription can contribute and withdraw one notification per delivery.
  let pendingVersion = -1;
  const unsubscribe = subscribe(() => {
    if (ctx.deferDepth === 0) return update();
    if (pendingVersion === settled.version) return;
    pendingVersion = settled.version;
    settled.pending++;
    if (!settled.queued) {
      settled.queued = true;
      ctx.settledQueue[ctx.settledCount++] = settled;
      ctx.unsettled = true;
    }
  });
  return () => {
    unsubscribe();
    if (pendingVersion === settled.version) {
      settled.pending--;
      pendingVersion = -1;
    }
  };
}

export function subscribeSet<Args extends unknown[]>(
  ctx: WorldContext,
  subscriptions: Set<(...args: Args) => void>,
  callback: (...args: Args) => void
) {
  return subscribeHook(ctx, callback, (listener) => {
    subscriptions.add(listener);
    return () => subscriptions.delete(listener);
  });
}
