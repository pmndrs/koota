import { $internal, type Entity, type World } from '@koota/core';
import { isWorld } from './is-world';

/** Resolve the entity a hook subscribes to. A world resolves to its world entity. */
export function getTargetEntity(target: Entity | World): Entity {
  if (!isWorld(target)) return target;
  // Adding no traits registers a lazy world so its entity exists.
  if (!target.isRegistered) target.add();
  return target[$internal].worldEntity;
}
