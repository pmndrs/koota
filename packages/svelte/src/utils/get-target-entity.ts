import { $internal as internal, type Entity, type World } from '@koota/core';
import { isWorld } from './is-world.js';

export function getTargetEntity(target: Entity | World | undefined | null): Entity | undefined {
  if (target == null) return undefined;
  if (!isWorld(target)) return target;
  return target.isRegistered ? target[internal].worldEntity : undefined;
}
