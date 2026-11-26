import { $internal as internal, type Entity, type World } from '@koota/core';
import { isWorld } from './is-world.js';

export function getTargetEntity(target: Entity | World | undefined | null): Entity | undefined {
  if (target == null) return undefined;
  if (!isWorld(target)) return target.isAlive() ? target : undefined;
  // Adding no traits registers a lazy world so its entity exists.
  if (!target.isRegistered) target.add();
  return target[internal].worldEntity ?? undefined;
}

/** World targets follow their backing entity through reset and destruction. */
export function observeTarget(
  target: Entity | World | null | undefined,
  listen: (entity: Entity | undefined) => (() => void) | void
) {
  if (target == null || !isWorld(target)) return listen(getTargetEntity(target));
  const ctx = target[internal];
  let detach: (() => void) | void;
  let revision = 0;
  const reset = () => {
    const current = ++revision;
    detach?.();
    detach = undefined;
    const next = listen(ctx.worldEntity ?? undefined);
    // An initial trait effect can register or reset its own world.
    if (current === revision) detach = next;
    else next?.();
  };
  const stop = () => {
    ctx.resetSubscriptions.delete(reset);
    revision++;
    detach?.();
  };
  ctx.resetSubscriptions.add(reset);
  try {
    reset();
  } catch (error) {
    stop();
    throw error;
  }
  return stop;
}
