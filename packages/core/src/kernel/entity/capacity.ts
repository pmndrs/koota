import { $internal } from '../common';
import type { KernelContext } from '../context';
import { applySpawnEntity } from '../commands/handlers/entity';
import { addRelationPair, applyAddPreparedTrait } from '../commands/handlers/trait';
import { abortMutation, finishMutation } from '../commands/lifecycle';
import { ensureMaskPage } from './paged-mask';
import { allocateEntity, isEntityAlive, releaseEntity } from './entity-index';
import { reserveMemberships, findMembership } from './membership';
import { reserveSparse } from './entity-set';
import { createStoragePage } from '../storage/initialize';
import { hasTrait } from '../trait/trait';
import type { ConfigurableTrait } from '../trait/types';
import type { Entity } from './types';

const _entity_emptyTraits: ConfigurableTrait[] = [];

/** Prepare identities, memberships, columns and existing query indexes before a bounded loop. */
export function reserveKernel(
  ctx: KernelContext,
  entityCapacity: number,
  membershipCapacity: number
): void {
  if (ctx.mutationDepth || ctx.flushing) throw new Error('Koota: Cannot reserve during mutation.');
  if (
    !Number.isInteger(entityCapacity) ||
    entityCapacity < ctx.entityIndex.aliveCount ||
    entityCapacity > 0x400000
  )
    throw new RangeError('Koota: Invalid entity capacity.');
  reserveMemberships(ctx.memberships, membershipCapacity);
  const index = ctx.entityIndex;
  while (index.dense.length < entityCapacity) {
    const alive = index.aliveCount;
    while (index.aliveCount < entityCapacity) allocateEntity(index);
    while (index.aliveCount > alive) releaseEntity(index, index.dense[index.aliveCount - 1]);
  }
  for (const page of index.ownedPages) {
    for (const generation of ctx.entityMasks) ensureMaskPage(generation, page);
    for (const masks of ctx.dirtyMasks.values())
      for (const generation of masks) ensureMaskPage(generation, page);
    for (const masks of ctx.changedMasks.values())
      for (const generation of masks) ensureMaskPage(generation, page);
  }
  for (const instance of ctx.definitions.values()) {
    const definition = instance.trait[$internal];
    if (definition.type === 'tag') continue;
    const pages = definition.relation
      ? Math.ceil((ctx.memberships.capacity + 1) / 1024)
      : index.ownedPages.length;
    for (let i = 0; i < pages; i++) {
      const page = definition.relation ? i : index.ownedPages[i];
      if (definition.type === 'aos') (instance.store as any[])[page] ??= createStoragePage(false);
      else
        for (const key in instance.store) {
          const store = instance.store as Record<string, any[]>;
          store[key][page] ??= createStoragePage(
            typeof (definition.schema as Record<string, unknown>)[key] === 'number'
          );
        }
    }
  }
  for (const query of ctx.queriesHashMap.values()) {
    reserveSparse(query.entities, entityCapacity);
    for (const filter of query.relationFilters ?? [])
      if (filter.targetQueryMatches) reserveSparse(filter.targetQueryMatches, entityCapacity);
    for (const group of query.trackingGroups)
      for (const masks of group.trackers)
        if (masks) for (const page of index.ownedPages) ensureMaskPage(masks, page);
  }
}

/** A negative status means full (-1) or nested mutation (-2). Never leases a page. */
export function tryCreateEntity(ctx: KernelContext): Entity {
  if (ctx.mutationDepth || ctx.flushing) return -2;
  if (ctx.entityIndex.aliveCount === ctx.entityIndex.dense.length) return -1;
  ctx.mutationDepth++;
  let entity: Entity;
  try {
    entity = applySpawnEntity(ctx, _entity_emptyTraits);
  } catch (error) {
    abortMutation(ctx);
    throw error;
  }
  finishMutation(ctx);
  return entity;
}

/** 1 added, 0 present, -1 membership capacity, -2 invalid or unprepared predicate. */
export function tryAttachEntity(
  ctx: KernelContext,
  entity: Entity,
  predicate: Entity,
  value?: any
): number {
  if (
    ctx.mutationDepth ||
    !isEntityAlive(ctx.entityIndex, entity) ||
    !isEntityAlive(ctx.entityIndex, predicate)
  )
    return -2;
  if (findMembership(ctx.memberships, entity, predicate)) return 0;
  const pair = ctx.pairs.get(predicate);
  const definition = ctx.definitions.get(predicate);
  if (!pair && (!definition || definition.trait[$internal].relation)) return -2;
  const required = pair && !hasTrait(ctx, entity, pair.relation[$internal].trait) ? 2 : 1;
  if (ctx.memberships.capacity - ctx.memberships.count < required) return -1;
  ctx.mutationDepth++;
  try {
    if (pair) addRelationPair(ctx, entity, pair.descriptor, value);
    else applyAddPreparedTrait(ctx, entity, definition!, value);
  } catch (error) {
    abortMutation(ctx);
    throw error;
  }
  finishMutation(ctx);
  return 1;
}
