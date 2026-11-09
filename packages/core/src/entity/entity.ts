import { endStructuralChanges } from '../world/settled';
import { $internal } from '../common';
import { assertMachineIdle } from '../machine/machine';
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
import { checkQueryWithFilters } from '../query/utils/check-query-filters';
import { checkQueryTracking } from '../query/utils/check-query-tracking';
import {
  clearRelationEntity,
  getFirstRelationTarget,
  getRelationTargets,
  hasRelationPair,
} from '../relation/relation';
import {
  getIdentifierTarget,
  hasIdentifier,
  isIdentifier,
  isIdentifierPair,
} from '../identifier/identifier';
import type { Identifier, IdentifierPair } from '../identifier/types';
import type { Relation, RelationPair } from '../relation/types';
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

export function createEntity(ctx: WorldContext, traits: ConfigurableTrait[]): Entity {
  const entity = allocateEntity(ctx.entityIndex);

  ctx.structuralDepth++;
  try {
    // Queries that can match without traits need an initial membership check.
    const notQueries = ctx.notQueries;
    for (let i = 0; i < notQueries.length; i++) {
      const query = notQueries[i];
      resetQueryTrackingBitmasks(query, getEntityId(entity));
      if (query.filters?.tracking) {
        if (checkQueryTracking(ctx, query, entity, 'change', -1, 0)) addEntityToQuery(query, entity);
      } else if (!query.isTracking) {
        const matches =
          query.filters !== null
            ? checkQueryWithFilters(ctx, query, entity)
            : checkQuery(ctx, query, entity);
        if (matches) addEntityToQuery(query, entity);
      }
    }

    // Spawn is create then add in argument order. A trait that throws leaves the earlier ones in place.
    addTraitsToAliveEntity(ctx, entity, traits);

    /* @cold */ if (ctx.entitySpawnSubscriptions.size > 0 && !hasTrait(ctx, entity, IsExcluded)) {
      for (const sub of ctx.entitySpawnSubscriptions) sub(entity);
    }
  } finally {
    endStructuralChanges(ctx);
  }

  return entity;
}

/** An entity being destroyed cannot acquire a new identifier owner entry. */
export function isEntityDestroying(ctx: WorldContext, entity: Entity): boolean {
  if (!ctx.isDestroying) return false;
  return isDestroyMarked(ctx.destroyMarks, getEntityId(entity) << 1, entity, ctx.destroyStamp);
}

/** The destroy stamped by this outer call already visited the entity, whose mark is at twice its id. */
/* @inline @pure */ function isDestroyMarked(
  marks: Uint32Array,
  mark: number,
  entity: Entity,
  stamp: number
) {
  return marks[mark] === stamp && marks[mark + 1] === entity;
}

export function destroyEntity(ctx: WorldContext, entity: Entity) {
  if (assertsEnabled) {
    assertEntityAlive(ctx, entity);
  }

  // Subscribers run inside the loop below and may destroy entities themselves. A nested
  // call takes its own queue so it cannot wipe the cascade the outer call is still
  // walking, and shares the processed stamp so neither call destroys the same entity twice.
  const nested = ctx.isDestroying;
  const entityQueue = nested ? [entity] : ctx.destroyQueue;
  const stamp = nested ? ctx.destroyStamp : ++ctx.destroyStamp;

  if (!nested) entityQueue.push(entity);

  ctx.isDestroying = true;
  ctx.structuralDepth++;

  try {
    while (entityQueue.length > 0) {
      destroyQueuedEntity(ctx, entityQueue.pop()!, entityQueue, stamp);
    }
  } finally {
    ctx.isDestroying = nested;
    // Only a throw leaves entries behind. Trimming the length reallocates, so do it only then.
    if (!nested && entityQueue.length !== 0) entityQueue.length = 0;
    endStructuralChanges(ctx);
  }
}

/** Keep the destroy worker separate so trait removal and eviction have their own inlining budget. */
export function destroyQueuedEntity(
  ctx: WorldContext,
  entity: Entity,
  entityQueue: Entity[],
  stamp: number
) {
  if (ctx.machineMutations !== undefined && ctx.machineMutations.size !== 0) /* @cold */ {
    assertMachineIdle(ctx, entity);
  }
  const eid = getEntityId(entity);
  const marks = ctx.destroyMarks;
  const mark = eid << 1;
  if (isDestroyMarked(marks, mark, entity, stamp)) return;
  marks[mark] = stamp;
  marks[mark + 1] = entity;

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
    page[slot + DESTROYED_WORD] |= word;
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
      const marks = ctx.destroyMarks;
      for (const target of targets) {
        if (!isEntityAlive(ctx.entityIndex, target)) continue;
        if (isDestroyMarked(marks, getEntityId(target) << 1, target, stamp)) continue;
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
    const filters = query.filters!.pairs;
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
    instance.machine?.byEntity.delete(entity);
    if (
      instance.addSubscriptions.entityCount === 0 &&
      instance.removeSubscriptions.entityCount === 0 &&
      instance.changeSubscriptions.entityCount === 0 &&
      (instance.machine === undefined || instance.machine.byEntity.size === 0)
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

export /* @inline */ function entityHas(
  ctx: WorldContext,
  entity: Entity,
  trait: Trait | RelationPair | Identifier | IdentifierPair
): boolean {
  if (assertsEnabled) {
    assertEntityAlive(ctx, entity);
  }

  if (typeof trait !== 'function') /* @cold */ {
    if (isIdentifierPair(trait)) return hasIdentifier(ctx, entity, trait);
    return hasEntityRelationPair(ctx, entity, trait);
  }
  // An identifier shares the id of its backing trait, so presence reads it directly.
  return hasTrait(ctx, entity, trait as Trait);
}

/** The key an identifier gives the entity, or the first target of a relation. */
export /* @inline */ function entityTargetFor(
  ctx: WorldContext,
  entity: Entity,
  relation: Relation<any> | Identifier
) {
  if (isIdentifier(relation)) return getIdentifierTarget(ctx, entity, relation);
  return getFirstRelationTarget(ctx, relation, entity);
}

/** Every target of a relation, or the one key of an identifier as a list. */
export /* @inline */ function entityTargetsFor(
  ctx: WorldContext,
  entity: Entity,
  relation: Relation<any> | Identifier
) {
  if (isIdentifier(relation)) {
    const target = getIdentifierTarget(ctx, entity, relation);
    return target === undefined ? [] : [target];
  }
  return getRelationTargets(ctx, relation, entity);
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
