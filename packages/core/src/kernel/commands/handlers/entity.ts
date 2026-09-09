import { $internal } from '../../common';
import type { Entity } from '../../entity/types';
import {
  allocateEntity,
  activateReservedEntity,
  isEntityAlive,
  releaseEntity,
} from '../../entity/entity-index';
import { forgetRelationPair, type PairRecord } from '../../entity/definitions';
import { firstMembership, firstUser } from '../../entity/membership';
import { getEntityId } from '../../entity/pack-entity';
import { EMPTY_MASK_PAGE } from '../../entity/paged-mask';
import { clearEntity } from '../../trait/subscriptions';
import type { ConfigurableTrait } from '../../trait/types';
import type { KernelContext } from '../../context';
import { applyAddTrait, applyRemoveTrait, cleanupRelationTarget } from './trait';

/** Publish identity to initial negative queries before applying the spawn's traits. */
export function beginSpawnEntity(ctx: KernelContext, reserved?: Entity): Entity {
  const entity =
    reserved === undefined
      ? allocateEntity(ctx.entityIndex)
      : activateReservedEntity(ctx.entityIndex, reserved);
  const id = getEntityId(entity);
  for (const query of ctx.notQueries) {
    if (query.isTracking) query.resetTrackingBitmasks(id);
    else if (query.check(ctx, entity)) query.add(entity);
  }
  return entity;
}

export function applySpawnEntity(
  ctx: KernelContext,
  traits: ConfigurableTrait[],
  reserved?: Entity
): Entity {
  const entity = beginSpawnEntity(ctx, reserved);
  for (const trait of traits) applyAddTrait(ctx, entity, trait);
  for (const sub of ctx.entitySpawnSubscriptions) sub(entity);
  return entity;
}

function enqueueDestroy(ctx: KernelContext, entity: Entity): void {
  if (!isEntityAlive(ctx.entityIndex, entity)) return;
  const id = getEntityId(entity);
  const page = ctx.memberships.pages[id >>> 10]!;
  const offset = 3072 + (id & 1023);
  if (page[offset]) return;
  page[offset] = 1;
  ctx.destroyQueue[ctx.destroyCount++] = entity;
}

function removePairUsers(ctx: KernelContext, pair: PairRecord): void {
  const edges = ctx.memberships;
  let edge = firstUser(edges, pair.entity);
  while (edge) {
    const source = edges.subjects[edge];
    cleanupRelationTarget(ctx, pair.relation, source, pair.target);
    if (pair.relation[$internal].autoDestroy === 'source') enqueueDestroy(ctx, source);
    edge = firstUser(edges, pair.entity);
  }
}

export function applyDestroyEntity(ctx: KernelContext, entity: Entity): void {
  if (!isEntityAlive(ctx.entityIndex, entity))
    throw new Error('Koota: The entity being destroyed does not exist.');
  ctx.destroyCount = 0;
  enqueueDestroy(ctx, entity);
  const edges = ctx.memberships;
  try {
    for (let cursor = 0; cursor < ctx.destroyCount; cursor++) {
      const current = ctx.destroyQueue[cursor];
      if (!isEntityAlive(ctx.entityIndex, current)) continue;
      let dependent = ctx.targetPairs.get(current);
      while (dependent) {
        removePairUsers(ctx, dependent);
        enqueueDestroy(ctx, dependent.entity);
        dependent = dependent.next ?? undefined;
      }
      const definition = ctx.definitions.get(current);
      if (definition) {
        for (const pairId of definition.pairs.values()) {
          const pair = ctx.pairs.get(pairId)!;
          removePairUsers(ctx, pair);
          enqueueDestroy(ctx, pairId);
        }
      }
      const ownPair = ctx.pairs.get(current);
      if (ownPair) removePairUsers(ctx, ownPair);
      for (let edge = firstMembership(edges, current); edge; edge = edges.next[edge]) {
        const pair = ctx.pairs.get(edges.predicates[edge]);
        if (pair?.relation[$internal].autoDestroy === 'target') enqueueDestroy(ctx, pair.target);
      }
      if (!ctx.implicitEntities.has(current)) {
        for (const sub of ctx.entityDestroySubscriptions) sub(current);
      }
      let edge = firstMembership(edges, current);
      while (edge) {
        const predicate = edges.predicates[edge];
        const trait = ctx.definitions.get(predicate);
        if (trait) applyRemoveTrait(ctx, current, trait.trait);
        else {
          const pair = ctx.pairs.get(predicate)!;
          cleanupRelationTarget(ctx, pair.relation, current, pair.target);
        }
        edge = firstMembership(edges, current);
      }
      if (definition) {
        let user = firstUser(edges, current);
        while (user) {
          applyRemoveTrait(ctx, edges.subjects[user], definition.trait);
          user = firstUser(edges, current);
        }
        definition.entity = -1;
        ctx.definitions.delete(current);
      }
      if (ownPair) forgetRelationPair(ctx, ownPair);
      if (ctx.preparedAccesses.size) ctx.preparedAccesses.delete(current);
      ctx.implicitEntities.delete(current);
      releaseEntity(ctx.entityIndex, current);
      // Negative queries can still contain an entity after its final trait is removed.
      for (const query of ctx.notQueries) query.remove(ctx, current);
      for (const instance of ctx.entitySubscribedInstances) {
        clearEntity(instance.addSubscriptions, current);
        clearEntity(instance.removeSubscriptions, current);
        clearEntity(instance.changeSubscriptions, current);
        if (
          instance.addSubscriptions.entityCount === 0 &&
          instance.removeSubscriptions.entityCount === 0 &&
          instance.changeSubscriptions.entityCount === 0
        )
          ctx.entitySubscribedInstances.delete(instance);
      }
      const id = getEntityId(current);
      for (const query of ctx.trackingQueries) {
        query.remove(ctx, current);
        query.resetTrackingBitmasks(id);
      }
      for (const masks of ctx.trackingSnapshots.values()) clearHistory(masks, id);
      for (const masks of ctx.dirtyMasks.values()) clearHistory(masks, id);
      for (const masks of ctx.changedMasks.values()) clearHistory(masks, id);
      for (let i = 0; i < ctx.entityMasks.length; i++) {
        const page = ctx.entityMasks[i][id >>> 10];
        if (page !== EMPTY_MASK_PAGE) page[id & 1023] = 0;
      }
    }
  } finally {
    for (let i = 0; i < ctx.destroyCount; i++) {
      const id = getEntityId(ctx.destroyQueue[i]);
      edges.pages[id >>> 10]![3072 + (id & 1023)] = 0;
    }
    ctx.destroyCount = 0;
  }
}

/** Slot-indexed history belongs to one entity lifetime. Clearing never materializes pages. */
function clearHistory(generations: Uint32Array[][], id: number): void {
  const pageId = id >>> 10;
  const offset = id & 1023;
  for (let i = 0; i < generations.length; i++) {
    const page = generations[i][pageId];
    if (page !== EMPTY_MASK_PAGE) page[offset] = 0;
  }
}
