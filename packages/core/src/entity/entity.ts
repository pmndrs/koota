import { assertsEnabled } from '../build-flags';
import { beginDefer, beginRootDefer, deferCommand, endDefer, endRootDefer } from '../command/buffer';
import { releaseIdentifierTrait } from '../identifier/ownership';
import { $internal } from '../internal';
import { removeMachineTrait } from '../machine/transitions';
import { evictEntityFromQuery } from '../query/membership';
import {
  enterTraitlessQueries,
  exitTraitlessQueries,
  reconcileDyingTraitQueries,
} from '../query/reconciliation';
import { dropTargetQueries } from '../query/registry';
import { IsExcluded } from '../query/terms';
import { AWAITING_BIT, queueOwnedTargets, releaseDependents } from '../relation/cascade';
import { clearRetainedPairs } from '../relation/pairs';
import { detachRelationTargets, getStoredRelationTargets } from '../relation/targets';
import { clearEntitySubscriptions, emit } from '../trait/hooks';
import { DESTROYED_WORD, EMPTY_MASK_PAGE, REMOVED_WORD } from '../trait/mask-table';
import { clearDyingTraitMembership, hasTraitMembership } from '../trait/membership';
import { applyAddTrait } from '../trait/ops';
import type { ConfigurableTrait, TraitInstance } from '../trait/types';
import type { WorldContext } from '../world/types';
import {
  allocateEntity,
  assertAliveOrWorldDestroyed,
  freeEntity,
  isEntityAlive,
  releaseRetainedEntity,
} from './entity-index';
import { getEntityId } from './handle';
import type { Entity } from './types';

export function createEntity(ctx: WorldContext, traits: ConfigurableTrait[]): Entity {
  const entity = allocateEntity(ctx.entityIndex);

  beginDefer(ctx);
  try {
    if (ctx.notQueries.length !== 0) enterTraitlessQueries(ctx, entity);

    // Spawn is create then add in argument order. A trait that throws leaves the earlier ones in place.
    applyAddTrait(ctx, entity, traits);

    /* @cold */ if (
      ctx.entitySpawnSubscriptions.size > 0 &&
      !hasTraitMembership(ctx, entity, IsExcluded)
    ) {
      for (const sub of ctx.entitySpawnSubscriptions) sub(entity);
    }
  } finally {
    endDefer(ctx);
  }

  return entity;
}

export function destroyEntity(ctx: WorldContext, entity: Entity) {
  if (assertsEnabled) {
    assertAliveOrWorldDestroyed(ctx, entity);
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

      if (ctx.notQueries.length !== 0) exitTraitlessQueries(ctx, entity);

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

function emitEntityDestroy(ctx: WorldContext, entity: Entity) {
  for (const sub of ctx.entityDestroySubscriptions) sub(entity);
}

/**
 * A dying entity leaves its queries and tells its subscribers. Data and outgoing relation
 * targets stay readable until eviction. Reverse relation indexes let go of it immediately.
 */
function removeTraitFromDyingEntity(ctx: WorldContext, entity: Entity, instance: TraitInstance) {
  const traitCtx = instance.trait[$internal];
  if (traitCtx.kind !== 'trait') /* @cold */ {
    removeSpecialDyingTrait(ctx, entity, instance);
    return;
  }
  emit(instance.removeSubscriptions, entity);
  traitCtx.remove(ctx, getEntityId(entity), instance.store);
  finishDyingTraitRemoval(ctx, entity, instance, undefined);
}

/** Release auxiliary membership before recording a dying trait's removal. */
function removeSpecialDyingTrait(ctx: WorldContext, entity: Entity, instance: TraitInstance) {
  const context = instance.trait[$internal];
  if (context.kind === 'machine') {
    removeMachineTrait(ctx, entity, instance.trait, true);
  } else if (context.kind === 'identifier') {
    releaseIdentifierTrait(ctx, entity, instance);
  } else {
    const targets = getStoredRelationTargets(instance, entity);
    for (const target of targets) emit(instance.removeSubscriptions, entity, target);
    detachRelationTargets(instance, entity);
    finishDyingTraitRemoval(ctx, entity, instance, targets);
    if (context.relation![$internal].autoDestroy === 'target') queueOwnedTargets(ctx, targets);
  }
}

/** @inline */
function finishDyingTraitRemoval(
  ctx: WorldContext,
  entity: Entity,
  instance: TraitInstance,
  targets: readonly Entity[] | undefined
) {
  clearDyingTraitMembership(ctx, entity, instance);

  // Most traits have no query to leave, so the check stays here and the work is a call.
  if (
    instance.queries.length !== 0 ||
    instance.trackingQueries.length !== 0 ||
    instance.anchorRelations.length !== 0 ||
    targets !== undefined
  ) {
    reconcileDyingTraitQueries(ctx, entity, instance, targets);
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
      if (instance.relationTargets !== undefined) clearRetainedPairs(instance, eid);
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
