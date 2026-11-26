import { $internal as internal, type Entity, type World } from '@koota/core';
import { isWorld } from './is-world.js';

export function getTargetEntity(target: Entity | World | undefined | null): Entity | undefined {
  if (target == null) return undefined;
  if (!isWorld(target)) return target.isAlive() ? target : undefined;
  // Adding no traits registers a lazy world so its entity exists.
  if (!target.isRegistered) target.add();
  return target[internal].worldEntity ?? undefined;
}

/** Attach to the new world entity before notifying a trait effect. */
export function subscribeTarget(
  target: Entity | World | null | undefined,
  attach: (entity: Entity | undefined) => (() => void) | void,
  afterReset?: () => void
) {
  if (target == null || !isWorld(target)) return attach(getTargetEntity(target));
  const ctx = target[internal];
  const bind = () => attach(ctx.worldEntity ?? undefined);
  let detach = bind();
  const reset = () => {
    detach?.();
    detach = bind();
    afterReset?.();
  };
  ctx.resetSubscriptions.add(reset);
  return () => {
    ctx.resetSubscriptions.delete(reset);
    detach?.();
  };
}
