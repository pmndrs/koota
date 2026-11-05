import { $internal } from '../common';
import { assertsEnabled } from '../assert-config';
import { assertEntityAlive } from '../asserts';
import {
  addEntityToQuery,
  dropQuery,
  evictEntityFromQuery,
  IsExcluded,
  leaveTraitlessQueries,
  queryInternal,
  resetQueryTrackingBitmasks,
} from '../query/query';
import { checkQuery } from '../query/utils/check-query';
import { clearRelationEntity, getRelationTargets, hasRelationPair } from '../relation/relation';
import { isIdentifierPair, lookupIdentifier } from '../identifier/identifier';
import type { Identifier, IdentifierPair } from '../identifier/types';
import type { RelationPair } from '../relation/types';
import { clearEntity, subscribeEntity, type Subscriber } from '../trait/subscriptions';
import {
  addTraitsToAliveEntity,
  cleanupRelationTarget,
  hasTrait,
  registerTrait,
  removeTraitFromDyingEntity,
} from '../trait/trait';
import { getTraitInstance, hasTraitInstance } from '../trait/trait-instance';
import type { ConfigurableTrait, Trait } from '../trait/types';
import type { WorldContext } from '../world';
import type { QueryInstance, ResolvedRelationFilter } from '../query/types';
import { resolveHookCallback, resolveHookTrait, type HookInput } from '../world/utils/resolve-hook';
import type { Entity } from './types';
import {
  allocateEntity,
  freeEntity,
  isEntityAlive,
  releaseRetainedEntity,
} from './utils/entity-index';
import { getEntityId } from './utils/pack-entity';
import { DESTROYED_WORD, EMPTY_MASK_PAGE, REMOVED_WORD } from './utils/paged-mask';
import { addressSpace } from './utils/address-space';

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

/** An entity being destroyed cannot acquire a new identifier owner entry. */
export function isEntityDestroying(entity: Entity): boolean {
  if (!isDestroying) return false;
  const eid = getEntityId(entity);
  return processedStamp[eid] === destroyStamp && processedEntity[eid] === entity;
}

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
      destroyQueuedEntity(ctx, entityQueue.pop()!, entityQueue, stamp);
    }
  } finally {
    isDestroying = nested;
    // Only a throw leaves entries behind. Trimming the length reallocates, so do it only then.
    if (!nested && entityQueue.length !== 0) entityQueue.length = 0;
  }
}

/** Keep the destroy worker separate so trait removal and eviction have their own inlining budget. */
export function destroyQueuedEntity(
  ctx: WorldContext,
  entity: Entity,
  entityQueue: Entity[],
  stamp: number
) {
  const eid = getEntityId(entity);
  if (processedStamp[eid] === stamp && processedEntity[eid] === entity) {
    return;
  }
  processedStamp[eid] = stamp;
  processedEntity[eid] = entity;

  if (ctx.relations.length !== 0) {
    cleanupDestroyedRelations(ctx, entity, eid, entityQueue, stamp);
  }

  if (ctx.entityDestroySubscriptions.size > 0 && entity !== ctx.worldEntity) {
    emitEntityDestroy(ctx, entity);
  }
  // Remove every trait the masks still hold. A removal may cascade into others, so the word
  // is read again after each one. Record the held word first so Removed query filters
  // match the traits the entity held at destruction.
  const pageId = eid >>> 10;
  const offset = eid & 1023;
  const slot = offset << 2;
  const entityMasks = ctx.entityMasks;
  for (let g = 0; g < entityMasks.length; g++) {
    const page = entityMasks[g][pageId];
    if (page === EMPTY_MASK_PAGE) continue;
    const traitsByBit = ctx.traitsByBit[g];
    let word = page[slot];
    page[slot + DESTROYED_WORD] = word;
    while (word !== 0) {
      const low = word & -word;
      const instance = traitsByBit[31 - Math.clz32(low)];
      removeTraitFromDyingEntity(ctx, entity, instance);
      // Clear the bit by hand in case removal declined, so the walk always ends.
      word = page[slot] & ~low;
    }
  }

  // Keep the data and id for Removed queries until eviction.
  freeEntity(ctx.entityIndex, entity);

  const targetQueries = ctx.targetQueries[pageId]?.[offset];
  if (targetQueries) dropTargetQueries(ctx, targetQueries, entity, false);

  if (ctx.notQueries.length !== 0) leaveTraitlessQueries(ctx, entity);

  if (ctx.entitySubscribedInstances.size !== 0) clearEntitySubscriptions(ctx, entity);

  // Callbacks may have added traits during removal. Clear any remaining held bits, keeping history.
  for (let i = 0; i < entityMasks.length; i++) {
    const page = entityMasks[i][pageId];
    if (page === EMPTY_MASK_PAGE) continue;
    page[slot] = 0;
  }
  retainDestroyedEntity(ctx, entity);
}

/** Detach every relation that points at the dying entity and queue its auto destroy cascade. */
function cleanupDestroyedRelations(
  ctx: WorldContext,
  entity: Entity,
  entityId: number,
  entityQueue: Entity[],
  stamp: number
) {
  const relations = ctx.relations;
  for (let r = 0; r < relations.length; r++) {
    const relation = relations[r];
    const relationCtx = relation[$internal];
    const cascade = relationCtx.autoDestroy === 'source';

    // Cleanup swap-removes the source from this bucket, so walk it from the end.
    const sources = getTraitInstance(ctx.traitInstances, relationCtx.trait)
      ?.relationSourcesByTarget?.[entityId];
    if (sources !== undefined) {
      for (let i = sources.length - 1; i >= 0; i--) {
        if (i >= sources.length) continue;
        const source = sources[i];
        if (!isEntityAlive(ctx.entityIndex, source)) continue;
        // A source that dies with its target keeps the pair until eviction and cleans up on destroy.
        if (cascade) {
          entityQueue.push(source);
          continue;
        }
        cleanupRelationTarget(ctx, relation, source, entity);
      }
    }

    if (relationCtx.autoDestroy === 'target') {
      const targets = getRelationTargets(ctx, relation, entity);
      for (const target of targets) {
        if (!isEntityAlive(ctx.entityIndex, target)) continue;
        const targetId = getEntityId(target);
        if (processedStamp[targetId] === stamp && processedEntity[targetId] === target) continue;
        entityQueue.push(target);
      }
    }
  }
}

function emitEntityDestroy(ctx: WorldContext, entity: Entity) {
  for (const sub of ctx.entityDestroySubscriptions) sub(entity);
}

/**
 * Drop the cached queries that name the entity as a relation target. A query that needs the pair
 * to match cannot match once its target dies. Any other is built again if it is queried later, so
 * it goes too unless it has subscribers. A tracking query waits for the eviction of its target,
 * since it may still hold the removals the destroy caused.
 */
function dropTargetQueries(
  ctx: WorldContext,
  targetQueries: QueryInstance[],
  entity: Entity,
  evicted: boolean
) {
  for (let i = targetQueries.length - 1; i >= 0; i--) {
    const query = targetQueries[i];
    const disposable =
      (evicted || !query.isTracking) &&
      (query.addSubscriptions === null || query.addSubscriptions.size === 0) &&
      (query.removeSubscriptions === null || query.removeSubscriptions.size === 0);
    const filters = query.relationFilters;
    for (let k = 0; k < filters.length; k++) {
      const pair = filters[k];
      if (pair.target === entity && (disposable || needsPair(query, pair))) {
        dropQuery(ctx, query);
        break;
      }
    }
  }
}

/** The query matches only entities that hold the pair, or that added or changed it. */
function needsPair(query: QueryInstance, pair: ResolvedRelationFilter): boolean {
  if (pair.term !== 4) return pair.term === 1;
  const groups = query.trackingGroups;
  for (let i = 0; i < groups.length; i++) {
    const group = groups[i];
    if (group.pairs !== null && group.pairs.includes(pair)) {
      return group.logic === 'and' && group.type !== 'remove';
    }
  }
  return false;
}

/**
 * Drop entity subscribers so a recycled id never inherits them. Instances that no longer hold
 * any are pruned from the index here.
 */
function clearEntitySubscriptions(ctx: WorldContext, entity: Entity) {
  for (const instance of ctx.entitySubscribedInstances) {
    clearEntity(instance.addSubscriptions, entity);
    clearEntity(instance.removeSubscriptions, entity);
    clearEntity(instance.changeSubscriptions, entity);
    if (
      instance.addSubscriptions.entityCount === 0 &&
      instance.removeSubscriptions.entityCount === 0 &&
      instance.changeSubscriptions.entityCount === 0
    ) {
      ctx.entitySubscribedInstances.delete(instance);
    }
  }
}

/** Keep the newest retain destroyed entities. Overflow evicts the oldest, including unread data. */
function retainDestroyedEntity(ctx: WorldContext, entity: Entity) {
  if (ctx.retain === 0) {
    evictEntity(ctx, entity);
    return;
  }
  const ring = ctx.tombstones;
  if (ring.ids.length === ctx.retain) {
    const oldest = ring.ids[ring.head];
    ring.ids[ring.head] = entity;
    if (++ring.head === ctx.retain) ring.head = 0;
    evictEntity(ctx, oldest);
  } else {
    ring.ids.push(entity);
  }
}

/** Release stored values and query entries before the slot becomes reusable. */
function evictEntity(ctx: WorldContext, entity: Entity) {
  const eid = getEntityId(entity);
  const pageId = eid >>> 10;
  const slot = (eid & 1023) << 2;
  const entityMasks = ctx.entityMasks;
  for (let g = 0; g < entityMasks.length; g++) {
    const page = entityMasks[g][pageId];
    if (page === EMPTY_MASK_PAGE) continue;
    let word = page[slot + REMOVED_WORD] | page[slot + DESTROYED_WORD];
    const traits = ctx.traitsByBit[g];
    while (word !== 0) {
      const low = word & -word;
      const instance = traits[31 - Math.clz32(low)];
      const queries = instance.trackingQueries;
      for (let i = 0; i < queries.length; i++) evictEntityFromQuery(queries[i], entity);
      if (instance.relationTargets !== undefined) clearRelationEntity(instance, eid);
      else instance.trait[$internal].clear?.(eid, instance.store);
      word &= ~low;
    }
    page[slot + REMOVED_WORD] = 0;
    page[slot + DESTROYED_WORD] = 0;
  }
  const targetQueries = ctx.targetQueries[pageId]?.[eid & 1023];
  if (targetQueries) dropTargetQueries(ctx, targetQueries, entity, true);
  releaseRetainedEntity(ctx.entityIndex, entity);
}

/** The world that owns a live entity. Used by entity methods. */
export /* @inline @pure */ function getEntityContext(entity: Entity): WorldContext {
  return addressSpace.pageOwners[getEntityId(entity) >>> 10]!;
}

export /* @inline */ function entityHas(
  ctx: WorldContext,
  entity: Entity,
  trait: Trait | RelationPair | Identifier | IdentifierPair
): boolean {
  if (assertsEnabled) {
    assertEntityAlive(ctx, entity);
  }

  if (typeof trait !== 'function') /* @cold */ {
    if (isIdentifierPair(trait)) return lookupIdentifier(ctx, trait) === entity;
    return hasEntityRelationPair(ctx, entity, trait);
  }
  // An identifier shares the id of its backing trait, so presence reads it directly.
  return hasTrait(ctx, entity, trait as Trait);
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
  callback: Subscriber<any>
) {
  if (!isEntityAlive(ctx.entityIndex, entity)) return () => {};
  const trait = resolveHookTrait(input);
  if (!hasTraitInstance(ctx.traitInstances, trait)) registerTrait(ctx, trait);
  const instance = getTraitInstance(ctx.traitInstances, trait)!;
  ctx.entitySubscribedInstances.add(instance);
  return subscribeEntity(instance[event], entity, resolveHookCallback(ctx, input, callback));
}
