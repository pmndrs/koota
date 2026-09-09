import {
  firstMembership,
  eraseMembership,
  findMembership,
  insertMembership,
  reserveMemberships,
} from '../../entity/membership';
import { isEntityAlive } from '../../entity/entity-index';
import { $internal } from '../../common';
import type { Entity } from '../../entity/types';
import { getEntityId } from '../../entity/pack-entity';
import { ensureMaskPage } from '../../entity/paged-mask';
import { publishChanged, applyPairChanged } from './changed';
import { checkQueryTrackingWithRelations } from '../../query/check-query-tracking-with-relations';
import { checkQueryWithRelations } from '../../query/check-query-with-relations';
import {
  addRelationTarget,
  getFirstRelationTarget,
  getRelationData,
  hasRelationToTarget,
  removeAllRelationTargets,
  removeRelationTarget,
  setRelationData,
} from '../../relation/relation';
import type { Relation } from '../../relation/types';
import { isRelationPair } from '../../relation/is-relation';
import { hasTrait, registerTrait } from '../../trait/trait';
import { emit } from '../../trait/subscriptions';
import { getTraitInstance, hasTraitInstance } from '../../trait/trait';
import type { ConfigurableTrait, Trait, TraitInstance } from '../../trait/types';
import type { RelationPair } from '../../relation/types';
import type { KernelContext } from '../../context';
import { invokeTraitHook, publishQueryNotifications } from '../lifecycle';

export function applyAddTrait(
  ctx: KernelContext,
  entity: Entity,
  config: ConfigurableTrait,
  initial?: any
) {
  if (isRelationPair(config)) {
    addRelationPair(ctx, entity, config, initial);
    return;
  }

  let trait: Trait;
  let params: Record<string, any> | undefined = initial;

  if (Array.isArray(config)) {
    [trait, params] = config as [Trait, Record<string, any>];
  } else {
    trait = config as Trait;
  }

  let instance = getTraitInstance(ctx.traitInstances, trait);
  if (!instance || instance.entity < 0) instance = registerTrait(ctx, trait);
  applyAddPreparedTrait(ctx, entity, instance, params);
}

/** Prepared callers resolve the definition once, outside the entity loop. */
export function applyAddPreparedTrait(
  ctx: KernelContext,
  entity: Entity,
  instance: TraitInstance,
  params?: any
): boolean {
  const data = addPreparedTraitToEntity(ctx, entity, instance);
  if (!data) return false;

  const trait = instance.trait;
  const traitCtx = trait[$internal];

  if (traitCtx.initialize) {
    const defaults = traitCtx.initialize(ctx, entity);
    traitCtx.init(getEntityId(entity), data.store, params ?? defaults);
  } else traitCtx.init(getEntityId(entity), data.store, params);

  if (traitCtx.hooks?.onAdd) invokeTraitHook(ctx, entity, trait, 'onAdd');
  emit(data.addSubscriptions, entity);
  publishQueryNotifications(ctx);
  return true;
}

export function addRelationPair(
  ctx: KernelContext,
  entity: Entity,
  pair: RelationPair,
  initial?: any
) {
  const relation = pair.relation;
  const target = pair.target;

  if (typeof target !== 'number' || !isEntityAlive(ctx.entityIndex, target)) return;

  const params = initial ?? pair.params;
  const relationCtx = relation[$internal];
  const relationTrait = relationCtx.trait;

  if (hasRelationToTarget(ctx, relation, entity, target)) return;

  if (relationCtx.exclusive) {
    const oldTarget = getFirstRelationTarget(ctx, relation, entity);
    if (oldTarget !== undefined && oldTarget !== target) {
      const instance = getTraitInstance(ctx.traitInstances, relationTrait);
      if (instance) notifyRemove(ctx, entity, relationTrait, oldTarget);
      removeRelationTarget(ctx, relation, entity, oldTarget);
    }
  }

  let instance = addTraitToEntity(ctx, entity, relationTrait);

  const targetIndex = addRelationTarget(ctx, relation, entity, target);
  if (targetIndex === -1) return;

  relationTrait[$internal].init(
    targetIndex,
    (instance ?? getTraitInstance(ctx.traitInstances, relationTrait)!).store,
    params
  );

  instance = instance ?? getTraitInstance(ctx.traitInstances, relationTrait)!;
  invokeTraitHook(ctx, entity, relationTrait, 'onAdd', target);
  emit(instance.addSubscriptions, entity, target);
  publishQueryNotifications(ctx);
}

export function applyRemoveTrait(ctx: KernelContext, entity: Entity, trait: Trait | RelationPair) {
  if (isRelationPair(trait)) {
    removeRelationPair(ctx, entity, trait);
    return;
  }

  if (!isEntityAlive(ctx.entityIndex, entity)) return;
  const instance = getTraitInstance(ctx.traitInstances, trait);
  if (!instance) return;
  const relation = trait[$internal].relation;
  if (!relation) {
    applyRemovePreparedTrait(ctx, entity, instance);
    return;
  }
  if (!hasTrait(ctx, entity, trait)) return;
  notifyRelationRemovals(ctx, entity, relation);
  removeAllRelationTargets(ctx, relation, entity);
  removePreparedTraitFromEntity(ctx, entity, instance);
}

/* @inline */ function removeRelationPair(ctx: KernelContext, entity: Entity, pair: RelationPair) {
  const relation = pair.relation;
  const target = pair.target;
  const relationTrait = relation[$internal].trait;

  if (!hasTrait(ctx, entity, relationTrait)) return;

  const instance = getTraitInstance(ctx.traitInstances, relationTrait);

  if (target === '*') {
    if (instance) {
      notifyRelationRemovals(ctx, entity, relation);
    }
    removeAllRelationTargets(ctx, relation, entity);
    removeTraitFromEntity(ctx, entity, relationTrait);
    return;
  }

  if (typeof target === 'number') {
    if (instance && hasRelationToTarget(ctx, relation, entity, target))
      notifyRemove(ctx, entity, relationTrait, target);

    const status = removeRelationTarget(ctx, relation, entity, target);
    if (status === 0) return;

    if (status === 2) removeTraitFromEntity(ctx, entity, relationTrait);
  }
}

export function cleanupRelationTarget(
  ctx: KernelContext,
  relation: Relation<Trait>,
  entity: Entity,
  target: Entity
): void {
  const relationTrait = relation[$internal].trait;

  const instance = getTraitInstance(ctx.traitInstances, relationTrait);
  if (instance && hasRelationToTarget(ctx, relation, entity, target))
    notifyRemove(ctx, entity, relationTrait, target);

  const status = removeRelationTarget(ctx, relation, entity, target);
  if (status === 0) return;

  if (status === 2) removeTraitFromEntity(ctx, entity, relationTrait);
}

export function applySetTrait(
  ctx: KernelContext,
  entity: Entity,
  trait: Trait | RelationPair,
  value: any,
  triggerChanged = true
) {
  if (isRelationPair(trait)) return setTraitForPair(ctx, entity, trait, value, triggerChanged);
  if (!hasTrait(ctx, entity, trait)) return;
  return setTraitForTrait(ctx, entity, trait, value, triggerChanged);
}

/* @inline */ function setTraitForPair(
  ctx: KernelContext,
  entity: Entity,
  pair: RelationPair,
  value: any,
  triggerChanged: boolean
) {
  const relation = pair.relation as Relation<Trait>;
  const target = pair.target;

  if (typeof target !== 'number' || !hasRelationToTarget(ctx, relation, entity, target)) return;

  if (typeof value === 'function') value = value(getRelationData(ctx, entity, relation, target));
  setRelationData(ctx, entity, relation, target, value);
  if (triggerChanged) applyPairChanged(ctx, entity, relation[$internal].trait, target);
  else invokeTraitHook(ctx, entity, relation[$internal].trait, 'onSet', target);
}

/* @inline */ function setTraitForTrait(
  ctx: KernelContext,
  entity: Entity,
  trait: Trait,
  value: any,
  triggerChanged: boolean
) {
  const traitCtx = trait[$internal];
  const data = getTraitInstance(ctx.traitInstances, trait)!;
  const store = data.store;
  const index = getEntityId(entity);

  value instanceof Function && (value = value(traitCtx.get(index, store)));

  traitCtx.set(index, store, value);
  if (triggerChanged) publishChanged(ctx, entity, data);
  else {
    invokeTraitHook(ctx, entity, trait, 'onSet');
    data.version++;
  }
}

/* @inline */ function addTraitToEntity(
  ctx: KernelContext,
  entity: Entity,
  trait: Trait
): TraitInstance | undefined {
  if (hasTrait(ctx, entity, trait)) return undefined;

  if (
    !hasTraitInstance(ctx.traitInstances, trait) ||
    getTraitInstance(ctx.traitInstances, trait)!.entity < 0
  )
    registerTrait(ctx, trait);

  const instance = getTraitInstance(ctx.traitInstances, trait)!;
  return addPreparedTraitToEntity(ctx, entity, instance);
}

function addPreparedTraitToEntity(
  ctx: KernelContext,
  entity: Entity,
  instance: TraitInstance
): TraitInstance | undefined {
  const { generationId, bitflag, queries, trackingQueries } = instance;

  const eid = getEntityId(entity);
  const pageId = eid >>> 10;
  const offset = eid & 1023;
  const mask = ensureMaskPage(ctx.entityMasks[generationId], pageId);
  if (mask[offset] & bitflag) return undefined;
  mask[offset] |= bitflag;
  instance.version++;

  for (const dirtyMask of ctx.dirtyMasks.values()) {
    ensureMaskPage(dirtyMask[generationId], pageId)[offset] |= bitflag;
  }

  for (const query of queries) {
    const match =
      query.relationFilters && query.relationFilters.length > 0
        ? checkQueryWithRelations(ctx, query, entity)
        : query.check(ctx, entity);
    if (match) query.add(entity);
    else query.remove(ctx, entity);
  }

  for (const query of trackingQueries) {
    const match =
      query.relationFilters && query.relationFilters.length > 0
        ? checkQueryTrackingWithRelations(ctx, query, entity, 'add', generationId, bitflag)
        : query.checkTracking(ctx, entity, 'add', generationId, bitflag);
    if (match) query.add(entity);
    else query.remove(ctx, entity);
  }

  const edges = ctx.memberships;
  if (edges.count === edges.capacity) reserveMemberships(edges, Math.max(256, edges.capacity * 2));
  insertMembership(edges, entity, instance.entity);

  return instance;
}

function removeTraitFromEntity(ctx: KernelContext, entity: Entity, trait: Trait): void {
  if (!hasTrait(ctx, entity, trait)) return;

  const instance = getTraitInstance(ctx.traitInstances, trait)!;
  removePreparedTraitFromEntity(ctx, entity, instance);
}

export function applyRemovePreparedTrait(
  ctx: KernelContext,
  entity: Entity,
  instance: TraitInstance
): boolean {
  const id = getEntityId(entity);
  if (!(ctx.entityMasks[instance.generationId][id >>> 10][id & 1023] & instance.bitflag))
    return false;
  emit(instance.removeSubscriptions, entity);
  if (instance.trait[$internal].hooks?.onRemove)
    invokeTraitHook(ctx, entity, instance.trait, 'onRemove');
  removePreparedTraitFromEntity(ctx, entity, instance);
  return true;
}

function removePreparedTraitFromEntity(
  ctx: KernelContext,
  entity: Entity,
  instance: TraitInstance
): void {
  const trait = instance.trait;
  const { generationId, bitflag, queries, trackingQueries } = instance;

  const eid = getEntityId(entity);
  const pageId = eid >>> 10;
  const offset = eid & 1023;
  ctx.entityMasks[generationId][pageId][offset] &= ~bitflag;
  instance.version++;

  for (const dirtyMask of ctx.dirtyMasks.values()) {
    ensureMaskPage(dirtyMask[generationId], pageId)[offset] |= bitflag;
  }

  for (const query of queries) {
    const match =
      query.relationFilters && query.relationFilters.length > 0
        ? checkQueryWithRelations(ctx, query, entity)
        : query.check(ctx, entity);
    if (match) query.add(entity);
    else query.remove(ctx, entity);
  }

  for (const query of trackingQueries) {
    const match =
      query.relationFilters && query.relationFilters.length > 0
        ? checkQueryTrackingWithRelations(ctx, query, entity, 'remove', generationId, bitflag)
        : query.checkTracking(ctx, entity, 'remove', generationId, bitflag);
    if (match) query.add(entity);
    else query.remove(ctx, entity);
  }

  const edge = findMembership(ctx.memberships, entity, instance.entity);
  if (edge) eraseMembership(ctx.memberships, edge);
  if (!trait[$internal].relation) trait[$internal].clear(eid, instance.store);
}

function notifyRemove(ctx: KernelContext, entity: Entity, trait: Trait, target?: Entity): void {
  const instance = getTraitInstance(ctx.traitInstances, trait)!;
  emit(instance.removeSubscriptions, entity, target);
  invokeTraitHook(ctx, entity, trait, 'onRemove', target);
}

function notifyRelationRemovals(ctx: KernelContext, entity: Entity, relation: Relation<Trait>): void {
  const edges = ctx.memberships;
  for (let edge = firstMembership(edges, entity); edge; edge = edges.next[edge]) {
    const pair = ctx.pairs.get(edges.predicates[edge]);
    if (pair?.relation === relation)
      notifyRemove(ctx, entity, relation[$internal].trait, pair.target);
  }
}
