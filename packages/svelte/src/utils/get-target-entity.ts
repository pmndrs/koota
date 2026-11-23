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
  if (target != null && isWorld(target)) return target[internal].observeWorldEntity(listen);
  return listen(getTargetEntity(target));
}
