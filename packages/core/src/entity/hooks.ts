import { subscribeSet } from '../command/settled';
import type { WorldContext } from '../world/types';
import type { Entity } from './types';

/** Backs onEntitySpawn. Reports every entity spawned from now on. */
export function subscribeEntitySpawn(ctx: WorldContext, callback: (entity: Entity) => void) {
  return subscribeSet(ctx, ctx.entitySpawnSubscriptions, callback);
}

/** Backs onEntityDestroy. Reports every entity destroyed from now on, while it is still alive. */
export function subscribeEntityDestroy(ctx: WorldContext, callback: (entity: Entity) => void) {
  return subscribeSet(ctx, ctx.entityDestroySubscriptions, callback);
}
