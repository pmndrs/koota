import { removeSparse } from '@koota/collections';
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
  getRelationTargets,
  getRelationData,
  hasRelationToTarget,
  removeAllRelationTargets,
  removeRelationTarget,
  setRelationData,
  setRelationDataAtIndex,
} from '../../relation/relation';
import type { Relation } from '../../relation/types';
import { isRelationPair } from '../../relation/is-relation';
import { getSchemaDefaults } from '../../storage';
import { hasTrait, registerTrait } from '../../trait/trait';
import { emit } from '../../trait/subscriptions';
import { getTraitInstance, hasTraitInstance } from '../../trait/trait';
import type { ConfigurableTrait, Trait, TraitInstance } from '../../trait/types';
import type { RelationPair } from '../../relation/types';
import type { KernelContext } from '../../context';
import { invokeTraitHook, publishQueryNotifications } from '../lifecycle';

export function applyAddTrait(ctx: KernelContext, entity: Entity, config: ConfigurableTrait) {
  if (isRelationPair(config)) {
    addRelationPair(ctx, entity, config);
    return;
  }

  let trait: Trait;
  let params: Record<string, any> | undefined;

  if (Array.isArray(config)) {
    [trait, params] = config as [Trait, Record<string, any>];
  } else {
    trait = config as Trait;
  }

  const data = addTraitToEntity(ctx, entity, trait);
  if (!data) return;

  const traitCtx = trait[$internal];

  const defaults = traitCtx.initialize
    ? traitCtx.initialize(ctx, entity)
    : getSchemaDefaults(data.schema, traitCtx.type);

  if (traitCtx.type === 'aos') {
    traitCtx.set(getEntityId(entity), data.store, params ?? defaults);
  } else if (defaults) {
    traitCtx.set(getEntityId(entity), data.store, { ...defaults, ...params });
  } else if (params) {
    traitCtx.set(getEntityId(entity), data.store, params);
  }

  if (traitCtx.hooks?.onAdd) invokeTraitHook(ctx, entity, trait, 'onAdd');
  emit(data.addSubscriptions, entity);
  publishQueryNotifications(ctx);
}

/* @inline */ function addRelationPair(ctx: KernelContext, entity: Entity, pair: RelationPair) {
  const relation = pair.relation;
  const target = pair.target;

  if (typeof target !== 'number') return;

  const params = pair.params;
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

  const schema = instance?.schema ?? getTraitInstance(ctx.traitInstances, relationTrait)!.schema;
  const defaults = getSchemaDefaults(schema, relationTrait[$internal].type);

  if (defaults) {
    setRelationDataAtIndex(ctx, entity, relation, targetIndex, { ...defaults, ...params });
  } else if (params) {
    setRelationDataAtIndex(ctx, entity, relation, targetIndex, params);
  }

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

  if (!hasTrait(ctx, entity, trait)) return;

  const traitCtx = trait[$internal];

  if (traitCtx.relation) {
    const instance = getTraitInstance(ctx.traitInstances, trait);
    if (instance) {
      const targets = getRelationTargets(ctx, traitCtx.relation, entity);
      for (const t of targets) notifyRemove(ctx, entity, trait, t);
    }
    removeAllRelationTargets(ctx, traitCtx.relation, entity);
  } else {
    const instance = getTraitInstance(ctx.traitInstances, trait);
    if (instance) notifyRemove(ctx, entity, trait);
  }

  removeTraitFromEntity(ctx, entity, trait);
}

/* @inline */ function removeRelationPair(ctx: KernelContext, entity: Entity, pair: RelationPair) {
  const relation = pair.relation;
  const target = pair.target;
  const relationTrait = relation[$internal].trait;

  if (!hasTrait(ctx, entity, relationTrait)) return;

  const instance = getTraitInstance(ctx.traitInstances, relationTrait);

  if (target === '*') {
    if (instance) {
      const targets = getRelationTargets(ctx, relation, entity);
      for (const t of targets) notifyRemove(ctx, entity, relationTrait, t);
    }
    removeAllRelationTargets(ctx, relation, entity);
    removeTraitFromEntity(ctx, entity, relationTrait);
    return;
  }

  if (typeof target === 'number') {
    if (instance && hasRelationToTarget(ctx, relation, entity, target))
      notifyRemove(ctx, entity, relationTrait, target);

    const { removedIndex, wasLastTarget } = removeRelationTarget(ctx, relation, entity, target);
    if (removedIndex === -1) return;

    if (wasLastTarget) removeTraitFromEntity(ctx, entity, relationTrait);
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

  const { removedIndex, wasLastTarget } = removeRelationTarget(ctx, relation, entity, target);
  if (removedIndex === -1) return;

  if (wasLastTarget) removeTraitFromEntity(ctx, entity, relationTrait);
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

  if (!hasTraitInstance(ctx.traitInstances, trait)) registerTrait(ctx, trait);

  const instance = getTraitInstance(ctx.traitInstances, trait)!;
  const { generationId, bitflag, queries, trackingQueries } = instance;

  const eid = getEntityId(entity);
  const pageId = eid >>> 10;
  const offset = eid & 1023;
  ensureMaskPage(ctx.entityMasks[generationId], pageId)[offset] |= bitflag;
  instance.version++;

  for (const dirtyMask of ctx.dirtyMasks.values()) {
    ensureMaskPage(dirtyMask[generationId], pageId)[offset] |= bitflag;
  }

  for (const query of queries) {
    removeSparse(query.toRemove, entity);
    const match =
      query.relationFilters && query.relationFilters.length > 0
        ? checkQueryWithRelations(ctx, query, entity)
        : query.check(ctx, entity);
    if (match) query.add(entity);
    else query.remove(ctx, entity);
  }

  for (const query of trackingQueries) {
    removeSparse(query.toRemove, entity);
    const match =
      query.relationFilters && query.relationFilters.length > 0
        ? checkQueryTrackingWithRelations(ctx, query, entity, 'add', generationId, bitflag)
        : query.checkTracking(ctx, entity, 'add', generationId, bitflag);
    if (match) query.add(entity);
    else query.remove(ctx, entity);
  }

  ctx.entityTraits.get(entity)!.add(trait);

  return instance;
}

function removeTraitFromEntity(ctx: KernelContext, entity: Entity, trait: Trait): void {
  if (!hasTrait(ctx, entity, trait)) return;

  const instance = getTraitInstance(ctx.traitInstances, trait)!;
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

  ctx.entityTraits.get(entity)!.delete(trait);
}

function notifyRemove(ctx: KernelContext, entity: Entity, trait: Trait, target?: Entity): void {
  const instance = getTraitInstance(ctx.traitInstances, trait)!;
  emit(instance.removeSubscriptions, entity, target);
  invokeTraitHook(ctx, entity, trait, 'onRemove', target);
}
