import { $internal, type World } from '@koota/core';

type Context = World[typeof $internal];
type Observers = { count: number; pending: Set<() => void>; settled: () => void };
const observers = new WeakMap<Context, Observers>();

export function observeSettled(ctx: Context, update: () => void) {
  let group = observers.get(ctx);
  if (!group) {
    const pending = new Set<() => void>();
    group = {
      count: 0,
      pending,
      settled: () => {
        if (pending.size === 0) return;
        const callbacks = Array.from(pending);
        pending.clear();
        let failed = false;
        let failure: unknown;
        for (const callback of callbacks) {
          try {
            callback();
          } catch (error) {
            if (!failed) {
              failed = true;
              failure = error;
            }
          }
        }
        if (failed) throw failure;
      },
    };
    observers.set(ctx, group);
    ctx.settledSubscriptions.add(group.settled);
  }
  group.count++;
  const subscribed = group;
  let active = true;
  const notify = () => {
    if (active) update();
  };
  return {
    invalidate(this: void) {
      if (!active) return;
      if (ctx.structuralDepth === 0 && !ctx.isSettling) update();
      else {
        subscribed.pending.add(notify);
        ctx.settledPending = true;
      }
    },
    unsubscribe(this: void) {
      if (!active) return;
      active = false;
      subscribed.pending.delete(notify);
      if (--subscribed.count === 0) {
        ctx.settledSubscriptions.delete(subscribed.settled);
        observers.delete(ctx);
      }
    },
  };
}
