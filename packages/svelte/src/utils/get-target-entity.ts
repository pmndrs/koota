import { $internal as internal, type Entity, type World } from '@koota/core';
import { isWorld } from './is-world.js';

export function getTargetEntity(target: Entity | World | undefined | null): Entity | undefined {
  if (target == null) return undefined;
  if (!isWorld(target)) return target;
  // Adding no traits registers a lazy world so its entity exists.
  if (!target.isRegistered) target.add();
  return target[internal].worldEntity;
}
