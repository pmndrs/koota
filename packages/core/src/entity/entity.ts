import { $internal } from '../common';
import { assertsEnabled } from '../assert-config';
import { assertEntityAlive, assertEntityReadable } from '../asserts';
import {
  addEntityToQuery,
  dropQuery,
  IsExcluded,
  queryInternal,
  removeEntityFromQuery,
  resetQueryTrackingBitmasks,
} from '../query/query';
import { checkQuery } from '../query/utils/check-query';
import { clearRelationEntity, getRelationTargets, hasRelationPair } from '../relation/relation';
import { isNameConfig } from '../name/name-index';
import type { NameConfig } from '../name/types';
import type { RelationPair } from '../relation/types';
import { clearEntity, subscribeEntity, type Subscriber } from '../trait/subscriptions';
import {
  addTraitsToAliveEntity,
  cleanupRelationTarget,
  hasTrait,
  hasTraitOrRetained,
  registerTrait,
  removeTraitFromDyingEntity,
} from '../trait/trait';
import { getTraitInstance, hasTraitInstance } from '../trait/trait-instance';
import type { ConfigurableTrait, Trait, TraitInstance } from '../trait/types';
import type { WorldContext } from '../world';
import type { QueryInstance } from '../query/types';
import { resolveHookCallback, resolveHookTrait, type HookInput } from '../world/utils/resolve-hook';
import type { Entity } from './types';
import {
  allocateEntity,
  allocateFreshEntity,
  freeEntity,
  isEntityAlive,
  releaseEntity,
  reuseEntity,
} from './utils/entity-index';
import { canReleaseHead, moveHandle, pushHandle, shiftHandle } from './utils/handle-ring';
import { getEntityId } from './utils/pack-entity';
import { CHANGED_WORD, DESTROYED_WORD, EMPTY_MASK_PAGE, REMOVED_WORD } from './utils/paged-mask';
import { addressSpace } from './utils/address-space';

// Ensure entity methods are patched.
import './entity-methods-patch';

export function createEntity(ctx: WorldContext, traits: ConfigurableTrait[]): Entity {
  const entity = ctx.retain === 0 ? allocateEntity(ctx.entityIndex) : allocateReusing(ctx);

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

  if (ctx.eventEnding === entity) endEventEntity(ctx, entity);
  return entity;
}

/**
 * A subject pair added during a spawn or an add turns the entity into an event. It leaves its
 * queries and tells its subscribers like any destroy, with the subject already on the row so the
 * Removed readers see an event, and its id returns through the event ring.
 */
export function endEventEntity(ctx: WorldContext, entity: Entity) {
  ctx.eventEnding = -1;
  // The destroy handles the entity before anything it cascades into, so its handle lands where
  // the tombstone ring ended, and moves from there to the event ring.
  const at = ctx.tombstones.count;
  destroyEntity(ctx, entity);
  moveHandle(ctx.tombstones, at, ctx.events);
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

      // The rare work is kept out of line so the trait walk below stays within the optimizer's
      // inlining budget for this function.
      if (ctx.relations.length !== 0) {
        cleanupDestroyedRelations(ctx, currentEntity, currentId, entityQueue, stamp);
      }

      if (ctx.entityDestroySubscriptions.size > 0 && currentEntity !== ctx.worldEntity) {
        emitEntityDestroy(ctx, currentEntity);
      }

      // Remove every trait the masks still hold. A removal may cascade into others, so the word
      // is read again after each one. A world that keeps destroyed entities records the held word
      // first, beside a subject pair already there, so has, get and the other terms of Removed
      // queries see what the entity died with.
      const pageId = currentId >>> 10;
      const offset = currentId & 1023;
      const slot = offset << 2;
      const entityMasks = ctx.entityMasks;
      const keep = ctx.retain !== 0;
      for (let g = 0; g < entityMasks.length; g++) {
        const page = entityMasks[g][pageId];
        if (page === EMPTY_MASK_PAGE) continue;
        const traitsByBit = ctx.traitsByBit[g];
        let word = page[slot];
        page[slot + DESTROYED_WORD] |= word;
        while (word !== 0) {
          const low = word & -word;
          const instance = traitsByBit[31 - Math.clz32(low)];
          removeTraitFromDyingEntity(ctx, currentEntity, instance, keep);
          // Clear the bit by hand in case removal declined, so the walk always ends.
          word = page[slot] & ~low;
        }
      }

      // The id stays readable with its data until a spawn reuses it. A world that retains
      // nothing bumps the generation now.
      if (keep) {
        freeEntity(ctx.entityIndex, currentEntity);
        pushHandle(ctx.tombstones, currentEntity, ++ctx.destroySerial);
      } else {
        releaseEntity(ctx.entityIndex, currentEntity);
      }

      const targetQueries = ctx.targetQueries[pageId]?.[offset];
      if (targetQueries) dropTargetQueries(ctx, targetQueries, currentEntity);

      const allQuery = ctx.queriesHashMap.get('');
      if (allQuery) removeEntityFromQuery(ctx, allQuery, currentEntity);

      if (ctx.entitySubscribedInstances.size !== 0) clearEntitySubscriptions(ctx, currentEntity);

      // The history goes with the entity so a recycled id starts clean. A kept entity holds it
      // for the readers that seed from it, and the reuse of its id clears it.
      for (let i = 0; i < entityMasks.length; i++) {
        const page = entityMasks[i][pageId];
        if (page === EMPTY_MASK_PAGE) continue;
        page[slot] = 0;
        if (keep) continue;
        page[slot + REMOVED_WORD] = 0;
        page[slot + CHANGED_WORD] = 0;
        page[slot + DESTROYED_WORD] = 0;
      }
    }
  } finally {
    isDestroying = nested;
    // Only a throw leaves entries behind. Trimming the length reallocates, so do it only then.
    if (!nested && entityQueue.length !== 0) entityQueue.length = 0;
  }
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
  const keep = ctx.retain !== 0;
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
        // A source that dies with its target keeps the pair on its own tombstone, so its destroy
        // does the cleanup. A world that retains nothing clears the pair here as before.
        if (cascade) {
          entityQueue.push(source);
          if (keep) continue;
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

/** Drop the cached queries that filter on the dying entity as a relation target. */
function dropTargetQueries(ctx: WorldContext, targetQueries: QueryInstance[], entity: Entity) {
  for (let i = targetQueries.length - 1; i >= 0; i--) {
    const query = targetQueries[i];
    if (query.relationFilters!.some((pair) => pair.target === entity)) {
      dropQuery(ctx, query);
    }
  }
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

/** Drops the relation targets and pair data a destroyed entity kept, before its id is reused. */
function clearTombstoneRelations(word: number, traitsByBit: TraitInstance[], eid: number) {
  while (word !== 0) {
    const low = word & -word;
    const instance = traitsByBit[31 - Math.clz32(low)];
    if (instance.relationTargets !== undefined) clearRelationEntity(instance, eid);
    word &= ~low;
  }
}

/**
 * Spawn on a world that keeps destroyed entities. The oldest freed id is reused once at least
 * retain newer destroys have happened and every Removed reader has moved past it, or once sixteen
 * times retain are waiting on a reader that stalled. Otherwise the id space grows.
 */
function allocateReusing(ctx: WorldContext): Entity {
  const ring = ctx.tombstones;
  if (canReleaseHead(ring, ctx.retain, ctx.consumedSerial)) {
    const entity = shiftHandle(ring);
    clearTombstoneHistory(ctx, entity);
    return reuseEntity(ctx.entityIndex, entity);
  }
  return allocateFreshEntity(ctx.entityIndex);
}

/** Clear the history a destroyed entity kept so a reused id starts clean. */
export function clearTombstoneHistory(ctx: WorldContext, entity: Entity) {
  const eid = getEntityId(entity);
  const pageId = eid >>> 10;
  const slot = (eid & 1023) << 2;
  const entityMasks = ctx.entityMasks;
  const hasRelations = ctx.relations.length !== 0;
  for (let g = 0; g < entityMasks.length; g++) {
    const page = entityMasks[g][pageId];
    if (page === EMPTY_MASK_PAGE) continue;
    if (hasRelations) clearTombstoneRelations(page[slot + DESTROYED_WORD], ctx.traitsByBit[g], eid);
    page[slot + REMOVED_WORD] = 0;
    page[slot + CHANGED_WORD] = 0;
    page[slot + DESTROYED_WORD] = 0;
  }
}

/**
 * The oldest destroy serial every Removed reader has moved past. A reader has moved past a
 * destroy once it ran twice after it, since the first run exposes the batch and the second swaps
 * it out. With no such reader nothing holds an id back beyond the window.
 */
export function refreshConsumedSerial(ctx: WorldContext) {
  const readers = ctx.retainingQueries;
  let consumed = Infinity;
  for (let i = 0; i < readers.length; i++) {
    if (readers[i].consumedSerial < consumed) consumed = readers[i].consumedSerial;
  }
  ctx.consumedSerial = consumed;
}

/** The world that owns a live entity. Used by entity methods. */
export /* @inline @pure */ function getEntityContext(entity: Entity): WorldContext {
  return addressSpace.pageOwners[getEntityId(entity) >>> 10]!;
}

export /* @inline */ function entityHas(
  ctx: WorldContext,
  entity: Entity,
  trait: Trait | RelationPair | NameConfig
): boolean {
  if (assertsEnabled) {
    assertEntityReadable(ctx, entity);
  }

  if (typeof trait !== 'function') /* @cold */ {
    if (isNameConfig(trait)) return ctx.names.get(trait[1]) === entity;
    return hasEntityRelationPair(ctx, entity, trait);
  }
  // A destroyed entity or an event answers for the traits it held when it died.
  return hasTraitOrRetained(ctx, entity, trait);
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
    if (!hasTraitOrRetained(ctx, entity, pair.relation[$internal].trait)) return false;
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
