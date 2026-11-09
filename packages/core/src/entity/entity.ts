import { subscribeHook } from '../world/settled';
import { beginDefer, beginRootDefer, deferCommand, endDefer, endRootDefer } from '../world/defer';
import { $internal } from '../common';
import { assertsEnabled } from '../assert-config';
import { assertEntityAlive } from '../asserts';
import {
  addEntityToQuery,
  createQuery,
  dropQuery,
  evictEntityFromQuery,
  IsExcluded,
  leaveTraitlessQueries,
  resetQueryTrackingBitmasks,
  resolveQueryInstanceFromRef,
} from '../query/query';
import { isQuery } from '../query/utils/is-query';
import { checkQuery } from '../query/utils/check-query';
import { checkQueryWithFilters } from '../query/utils/check-query-filters';
import { checkQueryTracking } from '../query/utils/check-query-tracking';
import { subscribeRelationFilter } from '../relation/filter-hooks';
import {
  clearRelationEntity,
  getFirstRelationTarget,
  getRelationTargets,
  hasRelationPair,
  hasRelationTargetInSet,
} from '../relation/relation';
import {
  getIdentifierTarget,
  hasIdentifier,
  isIdentifier,
  isIdentifierPair,
} from '../identifier/identifier';
import type { Identifier, IdentifierPair } from '../identifier/types';
import type { Relation, RelationPair } from '../relation/types';
import { isRelationPair } from '../relation/utils/is-relation';
import { clearEntity, subscribeAll, subscribeEntity, type Subscriber } from '../trait/subscriptions';
import {
  applyAddTrait,
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
import { AWAITING_BIT, isAwaitingDestroy } from './utils/target-flags';
import { getEntityId } from './utils/pack-entity';
import { DESTROYED_WORD, EMPTY_MASK_PAGE, REMOVED_WORD } from './utils/paged-mask';

export function createEntity(ctx: WorldContext, traits: ConfigurableTrait[]): Entity {
  const entity = allocateEntity(ctx.entityIndex);

  beginDefer(ctx);
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
    applyAddTrait(ctx, entity, traits);

    /* @cold */ if (ctx.entitySpawnSubscriptions.size > 0 && !hasTrait(ctx, entity, IsExcluded)) {
      for (const sub of ctx.entitySpawnSubscriptions) sub(entity);
    }
  } finally {
    endDefer(ctx);
  }

  return entity;
}

export function destroyEntity(ctx: WorldContext, entity: Entity) {
  if (assertsEnabled) {
    assertEntityAlive(ctx, entity);
  }
  if (ctx.deferDepth !== 0) /* @cold */ {
    deferCommand(ctx, applyDestroyEntity, entity, undefined, undefined);
  } else {
    beginRootDefer(ctx);
    try {
      applyDestroyEntity(ctx, entity);
    } finally {
      endRootDefer(ctx);
    }
  }
}

/**
 * The destroy as a command. Destroys the entity and everything its relations cascade to. A source
 * is destroyed before its target, so its hooks never see a pair that points at a dead entity.
 * Same-world destroys from hooks are deferred, so each world walks one cascade at a time even
 * when hooks enter another world. The loop body is written in place on purpose. It keeps this
 * function above the 460 bytes TurboFan inlines, so it compiles on its own and trait removal and
 * eviction get an inlining budget that the caller's loop does not share.
 */
export function applyDestroyEntity(ctx: WorldContext, root: Entity) {
  const entityQueue = ctx.destroyQueue;
  entityQueue.push(root);
  try {
    while (entityQueue.length > 0) {
      const entity = entityQueue.pop()!;
      // A cycle or shared descendant can enqueue a handle more than once.
      if (!isEntityAlive(ctx.entityIndex, entity)) continue;
      const eid = getEntityId(entity);

      // Only an id something has pointed at has sources to settle. Sources that die with the
      // entity go first, so it waits on the stack under them.
      const flags = ctx.targetFlags[eid >>> 10];
      if (
        flags !== undefined &&
        flags[eid & 1023] !== 0 &&
        releaseDependents(ctx, entity, eid, entityQueue, flags)
      )
        continue;
      ctx.destroying = entity;

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

      // A removal that declined leaves its bit held. Clear what remains, keeping history.
      for (let i = 0; i < entityMasks.length; i++) {
        const page = entityMasks[i][pageId];
        if (page === EMPTY_MASK_PAGE) continue;
        page[slot] = 0;
      }
      retainDestroyedEntity(ctx, entity);
    }
  } finally {
    ctx.destroying = undefined;
    // Only a throw leaves entries behind. Trimming the length reallocates, so do it only then.
    if (entityQueue.length !== 0) {
      for (let i = 0; i < entityQueue.length; i++) {
        const id = getEntityId(entityQueue[i]);
        const flags = ctx.targetFlags[id >>> 10];
        if (flags !== undefined) flags[id & 1023] &= ~AWAITING_BIT;
      }
      entityQueue.length = 0;
    }
  }
}

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
    const filters = instance.relationFilterHooks;
    if (filters !== null) {
      for (const hooks of filters.values()) {
        clearEntity(hooks.added, entity);
        clearEntity(hooks.removed, entity);
      }
    }
    if (
      (filters === null || filters.size === 0) &&
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
    const filter = pair.targetQuery;
    const ref = isQuery(filter) ? filter : createQuery(...filter);
    // The entity's own targets are checked against the filter's members, so the cost follows
    // the targets of one entity and not every match of the filter.
    return hasRelationTargetInSet(
      ctx,
      pair.relation,
      entity,
      resolveQueryInstanceFromRef(ctx, ref).entities
    );
  }
  return hasRelationPair(ctx, entity, pair);
}

/** Install a trait hook after resolving its entity, exact target or relation filter. */
export function subscribeTraitEvent(
  ctx: WorldContext,
  entity: Entity | undefined,
  event: 'addSubscriptions' | 'removeSubscriptions' | 'changeSubscriptions',
  input: HookInput,
  callback: Subscriber<any>
) {
  if (entity !== undefined && !isEntityAlive(ctx.entityIndex, entity)) return () => {};
  const trait = resolveHookTrait(input);
  if (!hasTraitInstance(ctx.traitInstances, trait)) registerTrait(ctx, trait);
  const instance = getTraitInstance(ctx.traitInstances, trait)!;
  if (entity !== undefined) ctx.entitySubscribedInstances.add(instance);
  if (event === 'changeSubscriptions') ctx.trackingRevision++;
  const unsubscribe = subscribeEntity(
    instance[event],
    ctx.entityIndex,
    entity,
    resolveHookCallback(ctx, input, callback)
  );
  if (event === 'changeSubscriptions' || !isRelationPair(input) || !input.targetQuery) {
    return unsubscribe;
  }
  const stop = subscribeRelationFilter(
    ctx,
    instance,
    input,
    event === 'addSubscriptions',
    callback,
    entity
  );
  return () => {
    unsubscribe();
    stop();
  };
}
