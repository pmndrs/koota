import type { Entity } from './entity/types';
import { isEntityAlive } from './entity/utils/entity-index';
import { getEntityId } from './entity/utils/pack-entity';
import { getTraitInstance } from './trait/trait-instance';
import type { Trait } from './trait/types';
import type { WorldContext } from './world/types';

export /* @inline */ function assertEntityAlive(
  ctx: WorldContext | undefined | null,
  entity: Entity
): void {
  if (ctx === undefined || ctx === null) {
    throw createEntityNotAliveError(entity);
  }
  const index = ctx.entityIndex;
  const denseIdx = index.sparse[getEntityId(entity)];
  if (denseIdx === undefined || denseIdx >= index.aliveCount || index.dense[denseIdx] !== entity) {
    throw createEntityNotAliveError(entity);
  }
}

/**
 * The alive check for destroy and remove. A destroyed world passes, since destroying it already
 * destroyed its entities and the call then finds nothing to do. A dead entity of a live world
 * is a stale handle and still throws.
 */
export /* @inline */ function assertAliveOrWorldDestroyed(
  ctx: WorldContext | undefined | null,
  entity: Entity
): void {
  if (ctx === undefined || ctx === null) {
    throw createEntityNotAliveError(entity);
  }
  const index = ctx.entityIndex;
  const denseIdx = index.sparse[getEntityId(entity)];
  if (
    (denseIdx === undefined || denseIdx >= index.aliveCount || index.dense[denseIdx] !== entity) &&
    ctx.worldEntity !== null
  ) {
    throw createEntityNotAliveError(entity);
  }
}

export /* @inline */ function assertTraitPresent(ctx: WorldContext, entity: Entity, trait: Trait) {
  const instance = getTraitInstance(ctx.traitInstances, trait);
  const eid = getEntityId(entity);
  if (
    instance === undefined ||
    (instance.masks[eid >>> 10][(eid & 1023) << 2] & instance.bitflag) === 0
  ) {
    throw createTraitNotPresentError(entity, trait);
  }
}

export /* @inline */ function assertRelationTarget(
  ctx: WorldContext,
  target: unknown
): asserts target is Entity {
  // Liveness in this index also establishes world membership.
  if (typeof target !== 'number' || !isEntityAlive(ctx.entityIndex, target as Entity)) {
    throw createRelationTargetError(ctx, target);
  }
}

/**
 * World wide operations cannot run while a defer scope may still hold commands. Unlike the
 * assertions above this is checked in every build, since a reset under a walk corrupts the walk.
 */
export function assertOutsideDefer(ctx: WorldContext, operation: string) {
  if (ctx.deferDepth !== 0) {
    throw new Error(
      `Koota: [DEFER_SCOPE] ${operation} cannot run inside a walk, a hook or world.defer. Finish the scope first.`
    );
  }
}

// Variable bindings let the inlining plugin retain these cold dependencies.
export const createEntityNotAliveError = (entity: Entity): Error => {
  return new Error(
    `Koota: [ENTITY_ALIVE] The entity does not exist. It may have been destroyed. Entity ${entity}.`
  );
};

export const createTraitNotPresentError = (entity: Entity, trait: Trait, setting = false): Error => {
  return new Error(
    `Koota: [TRAIT_PRESENT] Add the trait before ${setting ? 'setting it' : 'changing or writing it'}. Entity ${entity}, trait ${trait.id}.`
  );
};

export const createRelationTargetError = (ctx: WorldContext, target: unknown): Error => {
  if (typeof target !== 'number') {
    return new Error(
      'Koota: [RELATION_TARGET] Adding or setting a relation requires one entity target. Wildcards and query filters cannot be written.'
    );
  }
  if (ctx.entityIndex.allocator.pageOwners[getEntityId(target as Entity) >>> 10] !== ctx) {
    return new Error(
      `Koota: [RELATION_WORLD] Relation target ${target} must belong to the source world.`
    );
  }
  return createEntityNotAliveError(target as Entity);
};
