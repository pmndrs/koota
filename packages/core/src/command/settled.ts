import type { WorldContext } from '../world/types';
import type { SettledCallback } from './types';

const $whenSettled = Symbol.for('koota.whenSettled');

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
    settled = { update, version: 0, pending: 0, round: -1 };
    callbacks.set(callback, settled);
  }
  // Each subscription can contribute and withdraw one notification per delivery.
  let pendingVersion = -1;
  const unsubscribe = subscribe(() => {
    if (ctx.deferDepth === 0) return update();
    if (pendingVersion === settled.version) return;
    pendingVersion = settled.version;
    if (settled.pending++ === 0 && settled.round !== ctx.settledRound) {
      settled.round = ctx.settledRound;
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

/** Release the slot before calling user code so the callback can queue another round. */
export function takeSettledCallback(
  queue: (SettledCallback | undefined)[],
  index: number,
  round: number
) {
  const callback = queue[index]!;
  queue[index] = undefined;
  if (callback.round !== round) return;
  const update = callback.pending > 0 ? callback.update : undefined;
  callback.round = -1;
  callback.pending = 0;
  callback.version++;
  return update;
}
