import type { WorldContext } from '../../world';
import type { Entity } from '../types';
import { getEntityId } from './pack-entity';

/** The id has a reverse bucket, so a destroy on it has sources to settle. */
export const TARGET_BIT = 1;
/** The entity waits on the destroy stack under the sources that die with it. */
export const AWAITING_BIT = 2;

/**
 * Destroy settles sources only for an id that carries the flag, so an entity nothing ever pointed
 * at skips that work. The flag is set when the id gets its reverse bucket and stays with it, so a
 * later entity on the id only pays a check that finds nothing.
 */
export function flagTarget(ctx: WorldContext, id: number) {
  (ctx.targetFlags[id >>> 10] ??= new Uint8Array(1024))[id & 1023] |= TARGET_BIT;
}

/**
 * An entity whose cascading sources are being destroyed ahead of it. It is still alive, so its
 * sources can read it from their hooks, and a cycle that reaches it again skips it.
 */
export function isAwaitingDestroy(ctx: WorldContext, entity: Entity): boolean {
  const id = getEntityId(entity);
  const flags = ctx.targetFlags[id >>> 10];
  return flags !== undefined && (flags[id & 1023] & AWAITING_BIT) !== 0;
}

/** A pair cannot be added to an entity that is being destroyed or waits to be. */
export function isDyingTarget(ctx: WorldContext, target: Entity): boolean {
  return ctx.destroying === target || isAwaitingDestroy(ctx, target);
}
