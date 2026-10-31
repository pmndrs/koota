import { $internal } from '../common';
import { assertsEnabled } from '../assert-config';
import { assertEntityAlive } from '../asserts';
import {
  addEntityToQuery,
  dropQuery,
  IsExcluded,
  queryInternal,
  removeEntityFromQuery,
  resetQueryTrackingBitmasks,
} from '../query/query';
import { checkQuery } from '../query/utils/check-query';
import { getRelationTargets, hasRelationPair } from '../relation/relation';
import { isNameConfig } from '../name/name-index';
import type { NameConfig } from '../name/types';
import type { RelationPair } from '../relation/types';
import { clearEntity, subscribeEntity, type Subscriber } from '../trait/subscriptions';
import {
  addTraitsToAliveEntity,
  cleanupRelationTarget,
  hasTrait,
  registerTrait,
  removeTraitFromAliveEntity,
} from '../trait/trait';
import { getTraitInstance, hasTraitInstance } from '../trait/trait-instance';
import type { ConfigurableTrait, Trait } from '../trait/types';
import { universe } from '../universe/universe';
import type { WorldContext } from '../world';
import { resolveHookCallback, resolveHookTrait, type HookInput } from '../world/utils/resolve-hook';
import type { Entity } from './types';
import { allocateEntity, isEntityAlive, releaseEntity } from './utils/entity-index';
import { getEntityId } from './utils/pack-entity';
import { EMPTY_MASK_PAGE } from './utils/paged-mask';

// Ensure entity methods are patched.
import './entity-methods-patch';

export function createEntity(ctx: WorldContext, traits: ConfigurableTrait[]): Entity {
  const entity = allocateEntity(ctx.entityIndex);

  // Tracking queries enter on trait events. Static exclusion queries need an initial match.
  const notQueries = ctx.notQueries;
  for (let i = 0; i < notQueries.length; i++) {
    const query = notQueries[i];
    resetQueryTrackingBitmasks(query, getEntityId(entity));
    if (!query.isTracking && checkQuery(ctx, query, entity)) addEntityToQuery(query, entity);
  }

  // Spawn is create then add in argument order. A trait that throws leaves the earlier ones in place.
  addTraitsToAliveEntity(ctx, entity, traits);

  /* @cold */ if (ctx.entitySpawnSubscriptions.size > 0 && !hasTrait(ctx, entity, IsExcluded)) {
    for (const sub of ctx.entitySpawnSubscriptions) sub(entity);
  }

  return entity;
}

// Entities already visited by the destroy in progress, keyed by id and stamped per outer call so
// nothing is cleared between destroys. The packed entity is kept so a recycled id is not mistaken
// for the entity that was destroyed before it.
const processedStamp: number[] = [];
const processedEntity: number[] = [];
let destroyStamp = 0;
const cachedQueue = [] as Entity[];
let isDestroying = false;

export function destroyEntity(ctx: WorldContext, entity: Entity) {
  if (assertsEnabled) {
    assertEntityAlive(ctx, entity);
  }

  // Subscribers run inside the loop below and may destroy entities themselves. A nested
  // call takes its own queue so it cannot wipe the cascade the outer call is still
  // walking, and shares the processed stamp so neither call destroys the same entity twice.
  const nested = isDestroying;
  const entityQueue = nested ? [entity] : cachedQueue;
  const stamp = nested ? destroyStamp : ++destroyStamp;

  if (!nested) entityQueue.push(entity);

  isDestroying = true;

  try {
    while (entityQueue.length > 0) {
      const currentEntity = entityQueue.pop()!;
      const currentId = getEntityId(currentEntity);
      if (processedStamp[currentId] === stamp && processedEntity[currentId] === currentEntity) {
        continue;
      }
      processedStamp[currentId] = stamp;
      processedEntity[currentId] = currentEntity;

      const relations = ctx.relations;
      for (let r = 0; r < relations.length; r++) {
        const relation = relations[r];
        const relationCtx = relation[$internal];

        // Cleanup swap-removes the source from this bucket, so walk it from the end.
        const sources = getTraitInstance(ctx.traitInstances, relationCtx.trait)
          ?.relationSourcesByTarget?.[currentId];
        if (sources !== undefined) {
          for (let i = sources.length - 1; i >= 0; i--) {
            if (i >= sources.length) continue;
            const source = sources[i];
            if (!isEntityAlive(ctx.entityIndex, source)) continue;
            cleanupRelationTarget(ctx, relation, source, currentEntity);
            if (relationCtx.autoDestroy === 'source') entityQueue.push(source);
          }
        }

        if (relationCtx.autoDestroy === 'target') {
          const targets = getRelationTargets(ctx, relation, currentEntity);
          for (const target of targets) {
            if (!isEntityAlive(ctx.entityIndex, target)) continue;
            const targetId = getEntityId(target);
            if (processedStamp[targetId] === stamp && processedEntity[targetId] === target) continue;
            entityQueue.push(target);
          }
        }
      }

      if (ctx.entityDestroySubscriptions.size > 0 && currentEntity !== ctx.worldEntity) {
        for (const sub of ctx.entityDestroySubscriptions) sub(currentEntity);
      }

      // Remove every trait the masks still hold. A removal may cascade into others, so the word
      // is read again after each one.
      const pageId = currentId >>> 10;
      const offset = currentId & 1023;
      const entityMasks = ctx.entityMasks;
      for (let g = 0; g < entityMasks.length; g++) {
        const page = entityMasks[g][pageId];
        if (page === EMPTY_MASK_PAGE) continue;
        const traitsByBit = ctx.traitsByBit[g];
        let word = page[offset];
        while (word !== 0) {
          const low = word & -word;
          const instance = traitsByBit[31 - Math.clz32(low)];
          removeTraitFromAliveEntity(ctx, currentEntity, instance.trait);
          // Clear the bit by hand in case removal declined, so the walk always ends.
          word = page[offset] & ~low;
        }
      }

      releaseEntity(ctx.entityIndex, currentEntity);

      const targetQueries = ctx.targetQueries[pageId]?.[offset];
      if (targetQueries) {
        for (let i = targetQueries.length - 1; i >= 0; i--) {
          const query = targetQueries[i];
          if (query.relationFilters!.some((pair) => pair.target === currentEntity)) {
            dropQuery(ctx, query);
          }
        }
      }

      const allQuery = ctx.queriesHashMap.get('');
      if (allQuery) removeEntityFromQuery(ctx, allQuery, currentEntity);

      // Drop entity subscribers so a recycled id never inherits them. Instances
      // that no longer hold any are pruned from the index here.
      for (const instance of ctx.entitySubscribedInstances) {
        clearEntity(instance.addSubscriptions, currentEntity);
        clearEntity(instance.removeSubscriptions, currentEntity);
        clearEntity(instance.changeSubscriptions, currentEntity);
        if (
          instance.addSubscriptions.entityCount === 0 &&
          instance.removeSubscriptions.entityCount === 0 &&
          instance.changeSubscriptions.entityCount === 0
        ) {
          ctx.entitySubscribedInstances.delete(instance);
        }
      }

      for (let i = 0; i < entityMasks.length; i++) {
        const page = entityMasks[i][pageId];
        if (page !== EMPTY_MASK_PAGE) page[offset] = 0;
      }
    }
  } finally {
    isDestroying = nested;
    // Only a throw leaves entries behind. Trimming the length reallocates, so do it only then.
    if (!nested && entityQueue.length !== 0) entityQueue.length = 0;
  }
}

/** Resolve WorldContext directly from pageOwners. Used by entity methods. */
export /* @inline @pure */ function getEntityContext(entity: Entity): WorldContext {
  return universe.pageOwners[getEntityId(entity) >>> 10]!;
}

export /* @inline */ function entityHas(
  ctx: WorldContext,
  entity: Entity,
  trait: Trait | RelationPair | NameConfig
): boolean {
  if (assertsEnabled) {
    assertEntityAlive(ctx, entity);
  }

  if (typeof trait !== 'function') /* @cold */ {
    if (isNameConfig(trait)) return ctx.names.get(trait[1]) === entity;
    return hasEntityRelationPair(ctx, entity, trait);
  }
  return hasTrait(ctx, entity, trait);
}

/**
 * Relation pairs including target queries. Kept out of line so the plain trait path
 * stays small, and kept thin so the optimizer can still inline the whole check.
 */
export function hasEntityRelationPair(
  ctx: WorldContext,
  entity: Entity,
  pair: RelationPair
): boolean {
  /* @cold */ if (pair.targetQuery) {
    if (!hasTrait(ctx, entity, pair.relation[$internal].trait)) return false;
    const targets = getRelationTargets(ctx, pair.relation, entity);
    for (const match of queryInternal(ctx, ...(pair.targetQuery as any))) {
      if (targets.includes(match)) return true;
    }
    return false;
  }
  return hasRelationPair(ctx, entity, pair);
}

/**
 * Subscribe to a trait event for one entity. The instance is indexed on the
 * world so destroy only visits traits that hold entity subscribers.
 * A dead handle registers nothing, since its id may already belong to another entity.
 */
export function subscribeEntityEvent(
  ctx: WorldContext,
  entity: Entity,
  event: 'addSubscriptions' | 'removeSubscriptions' | 'changeSubscriptions',
  input: HookInput,
  callback: Subscriber
) {
  if (!isEntityAlive(ctx.entityIndex, entity)) return () => {};
  const trait = resolveHookTrait(input);
  if (!hasTraitInstance(ctx.traitInstances, trait)) registerTrait(ctx, trait);
  const instance = getTraitInstance(ctx.traitInstances, trait)!;
  ctx.entitySubscribedInstances.add(instance);
  return subscribeEntity(instance[event], entity, resolveHookCallback(ctx, input, callback));
}
