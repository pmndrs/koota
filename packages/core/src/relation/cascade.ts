import { getEntityId } from '../entity/handle';
import type { Entity } from '../entity/types';
import { $internal } from '../internal';
import { getTraitInstance } from '../trait/registry';
import type { WorldContext } from '../world/types';
import { cleanupRelationTarget } from './pairs';

/**
 * A source dies before its target, so no hook sees a pair that points at a dead entity. Returns
 * true when the entity went back on the stack under the sources that die with it. Otherwise the
 * sources that outlive it let go of it.
 */
export function releaseDependents(
  ctx: WorldContext,
  entity: Entity,
  entityId: number,
  entityQueue: Entity[],
  flags: Uint8Array
): boolean {
  const relations = ctx.relations;
  const offset = entityId & 1023;
  if ((flags[offset] & AWAITING_BIT) === 0) {
    // Awaiting entities are skipped below, which covers a pair to itself and any cycle.
    const base = entityQueue.length;
    flags[offset] |= AWAITING_BIT;
    entityQueue.push(entity);
    for (let r = 0; r < relations.length; r++) {
      const relationCtx = relations[r][$internal];
      if (relationCtx.autoDestroy !== 'source') continue;
      const sources = getTraitInstance(ctx.traitInstances, relationCtx.trait)
        ?.relationSourcesByTarget?.[entityId];
      if (sources === undefined) continue;
      // The queue is a stack, so pushing in bucket order destroys the last source first and each
      // one leaves this bucket from its last slot.
      for (let i = 0; i < sources.length; i++) {
        if (!isAwaitingDestroy(ctx, sources[i])) entityQueue.push(sources[i]);
      }
    }
    if (entityQueue.length !== base + 1) return true;
    entityQueue.pop();
  }
  // Its cascading sources are gone, or it had none.
  flags[offset] &= ~AWAITING_BIT;
  for (let r = 0; r < relations.length; r++) {
    const relation = relations[r];
    // A source that dies with its target keeps the pair until eviction and cleans up on destroy.
    if (relation[$internal].autoDestroy === 'source') continue;
    const sources = getTraitInstance(ctx.traitInstances, relation[$internal].trait)
      ?.relationSourcesByTarget?.[entityId];
    if (sources === undefined) continue;
    // Cleanup swap-removes the source from this bucket, so walk it from the end.
    for (let i = sources.length - 1; i >= 0; i--) {
      cleanupRelationTarget(ctx, relation, sources[i], entity);
    }
  }
  return false;
}

/** The id has a reverse bucket, so a destroy on it has sources to settle. */
const TARGET_BIT = 1;
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
function isAwaitingDestroy(ctx: WorldContext, entity: Entity): boolean {
  const id = getEntityId(entity);
  const flags = ctx.targetFlags[id >>> 10];
  return flags !== undefined && (flags[id & 1023] & AWAITING_BIT) !== 0;
}

/** A pair cannot be added to an entity that is being destroyed or waits to be. */
export function isDyingTarget(ctx: WorldContext, target: Entity): boolean {
  return ctx.destroying === target || isAwaitingDestroy(ctx, target);
}

/** What an owner targets dies after it. A target that already waits on the stack stays there. */
export function queueOwnedTargets(ctx: WorldContext, targets: readonly Entity[]) {
  for (const target of targets) {
    if (!isAwaitingDestroy(ctx, target)) ctx.destroyQueue.push(target);
  }
}
