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

export /* @inline */ function assertTraitPresent(ctx: WorldContext, entity: Entity, trait: Trait) {
  const instance = getTraitInstance(ctx.traitInstances, trait);
  const eid = getEntityId(entity);
  if (
    instance === undefined ||
    (ctx.entityMasks[instance.generationId][eid >>> 10][eid & 1023] & instance.bitflag) === 0
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
