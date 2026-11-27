import { beginDefer, endDefer } from '../command/buffer';
import { subscribeHook, subscribeSet } from '../command/settled';
import { isEntityAlive } from '../entity/entity-index';
import { getEntityId } from '../entity/handle';
import type { Entity, EntityIndex } from '../entity/types';
import { isIdentifierPair } from '../identifier/identifier';
import { $internal } from '../internal';
import { subscribeTargetQuery } from '../query/hooks';
import { createQuery, isQuery } from '../query/query';
import { reconcileRelationQueries } from '../query/reconciliation';
import { ensureQueryInstance } from '../query/registry';
import { notifyChangedTrackingQueries } from '../query/tracking';
import type { QueryParameter } from '../query/types';
import { isRelationPair } from '../relation/relation';
import { getRelationSources } from '../relation/targets';
import type { QueryRelationPair, Relation } from '../relation/types';
import type { WorldContext } from '../world/types';
import { getTraitInstance, hasTraitInstance, registerTrait } from './registry';
import { resolveTrait } from './trait';
import type {
  RelationFilterHooks,
  Slot,
  Subscriber,
  Subscriptions,
  Trait,
  TraitHookInput,
  TraitInstance,
} from './types';

export function createSubscriptions(): Subscriptions {
  return { all: new Set(), byEntity: [], count: 0, entityCount: 0 };
}

/** @inline @pure */
export function hasSubscribers(subs: Subscriptions): boolean {
  return subs.count !== 0;
}

/** Registers a world subscriber and returns the function that removes it. */
export function subscribeAll(subs: Subscriptions, callback: Subscriber<any>): () => void {
  if (!subs.all.has(callback)) {
    subs.all.add(callback);
    subs.count++;
  }
  return () => {
    if (subs.all.delete(callback)) subs.count--;
  };
}

/**
 * Registers a subscriber for one entity. The index is the world's own, which tells the returned
 * function whether the entity still lives.
 */
export function subscribeEntity(
  subs: Subscriptions,
  index: EntityIndex,
  entity: Entity,
  callback: Subscriber<any>
): () => void {
  const eid = getEntityId(entity);
  const pageId = eid >>> 10;
  const offset = eid & 1023;

  let page = subs.byEntity[pageId];
  if (!page) page = subs.byEntity[pageId] = [];

  const slot = page[offset];
  if (slot === undefined) {
    page[offset] = callback;
    subs.entityCount++;
    subs.count++;
  } else if (typeof slot === 'function') {
    if (slot !== callback) {
      page[offset] = new Set([slot, callback]);
    }
  } else {
    slot.add(callback);
  }

  return () => {
    // A dead entity was cleared on destroy and its id may now belong to another entity.
    if (!isEntityAlive(index, entity)) return;
    const current = page[offset];
    if (current === undefined) return;
    if (current === callback) {
      page[offset] = undefined;
      subs.entityCount--;
      subs.count--;
    } else if (typeof current !== 'function' && current.delete(callback) && current.size === 0) {
      page[offset] = undefined;
      subs.entityCount--;
      subs.count--;
    }
  };
}

/** Drop every entity subscriber for an entity so a recycled id never inherits them. */
function clearEntity(subs: Subscriptions, entity: Entity) {
  if (subs.entityCount === 0) return;
  const eid = getEntityId(entity);
  const page = subs.byEntity[eid >>> 10];
  if (!page) return;
  const slot = page[eid & 1023];
  if (slot === undefined) return;
  page[eid & 1023] = undefined;
  subs.entityCount--;
  subs.count--;
}

/**
 * Invoke world subscribers then entity subscribers. The entity slot is read
 * after the world subscribers run so one of them can unsubscribe it. Plain
 * traits call with the entity alone so callbacks keep their one argument arity.
 */
/** @inline */
export function emit(subs: Subscriptions, entity: Entity, target?: string | number) {
  if (hasSubscribers(subs)) emitSubscribers(subs, entity, target);
}

/**
 * Exported so the inline guard in emit can expand in other modules. Callers hold a defer scope,
 * the operation's own for add, remove and destroy hooks and one opened around change hooks, so
 * structural changes a hook makes apply once the operation that reached it ends.
 */
export function emitSubscribers(subs: Subscriptions, entity: Entity, target?: string | number) {
  if (target === undefined) {
    for (const sub of subs.all) sub(entity);
    const slot = getSlot(subs, entity);
    if (slot === undefined) return;
    if (typeof slot === 'function') slot(entity);
    else for (const sub of slot) sub(entity);
  } else {
    for (const sub of subs.all) sub(entity, target);
    const slot = getSlot(subs, entity);
    if (slot === undefined) return;
    if (typeof slot === 'function') slot(entity, target);
    else for (const sub of slot) sub(entity, target);
  }
}

/** A destroy made by a subscriber is deferred, so the entity still owns its slot here. */
/** @inline @pure */
function getSlot(subs: Subscriptions, entity: Entity): Slot | undefined {
  if (subs.entityCount === 0) return undefined;
  const eid = getEntityId(entity);
  const page = subs.byEntity[eid >>> 10];
  return page && page[eid & 1023];
}

/**
 * Drop entity subscribers so a recycled id never inherits them. Instances that no longer hold
 * any are pruned from the index here.
 */
export function clearEntitySubscriptions(ctx: WorldContext, entity: Entity) {
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

/** @inline */
function findTraitMembership(ctx: WorldContext, entity: Entity, trait: Trait) {
  const data = getTraitInstance(ctx.traitInstances, trait);
  if (data === undefined) return;
  const index = getEntityId(entity);
  if ((data.masks[index >>> 10][(index & 1023) << 2] & data.bitflag) === 0) return;
  return data;
}

/** Notify after a validated write. A removed trait has no change to publish. */
export function notifyChanged(ctx: WorldContext, entity: Entity, trait: Trait) {
  const data = findTraitMembership(ctx, entity, trait);
  if (data) notifyTraitChanged(ctx, entity, data);
}

/** The caller must validate membership and finish the write without reentering the core. */
export /* @inline */ function notifyTraitChanged(
  ctx: WorldContext,
  entity: Entity,
  data: TraitInstance
) {
  data.version++;
  if (data.trackingQueries.length !== 0 || hasSubscribers(data.changeSubscriptions)) {
    notifyChangeSubscribers(ctx, entity, data, undefined);
  }
}

/**
 * Query reconciliation can call user hooks too. Hold one scope across tracking queries and
 * trait subscribers so every notification sees the write before structural follow-up work.
 */
export function notifyChangeSubscribers(
  ctx: WorldContext,
  entity: Entity,
  data: TraitInstance,
  target: Entity | undefined
) {
  beginDefer(ctx);
  try {
    if (data.trackingQueries.length !== 0) {
      notifyChangedTrackingQueries(ctx, entity, data);
      if (target !== undefined) {
        reconcileRelationQueries(ctx, data, entity, target, 'change', true);
      }
    }
    emit(data.changeSubscriptions, entity, target);
  } finally {
    endDefer(ctx);
  }
}

export function notifyPairChanged(ctx: WorldContext, entity: Entity, trait: Trait, target: Entity) {
  const data = getTraitInstance(ctx.traitInstances, trait);
  if (data === undefined) return;
  const index = getEntityId(entity);
  if ((data.masks[index >>> 10][(index & 1023) << 2] & data.bitflag) === 0) return;
  data.version++;
  if (data.trackingQueries.length !== 0 || hasSubscribers(data.changeSubscriptions)) {
    notifyChangeSubscribers(ctx, entity, data, target);
  }
}

/**
 * Add hooks see the initial value first. The defer scope keeps it present for change hooks.
 */
export /* @inline */ function notifyTraitAdded(entity: Entity, data: TraitInstance, target?: Entity) {
  emit(data.addSubscriptions, entity, target);
  emit(data.changeSubscriptions, entity, target);
}

/** Attaches a callback to a trait hook after resolving its entity, exact target or relation filter. */
function subscribeTrait(
  ctx: WorldContext,
  entity: Entity | undefined,
  event: 'addSubscriptions' | 'removeSubscriptions' | 'changeSubscriptions',
  input: TraitHookInput,
  callback: Subscriber<any>
) {
  if (entity !== undefined && !isEntityAlive(ctx.entityIndex, entity)) return () => {};
  const trait = resolveHookTrait(input);
  if (!hasTraitInstance(ctx.traitInstances, trait)) registerTrait(ctx, trait);
  const instance = getTraitInstance(ctx.traitInstances, trait)!;
  if (entity !== undefined) ctx.entitySubscribedInstances.add(instance);
  if (event === 'changeSubscriptions') ctx.trackingRevision++;
  return subscribeHook(ctx, callback, (listener) => {
    const resolved = resolveHookCallback(ctx, input, listener);
    const unsubscribe =
      entity === undefined
        ? subscribeAll(instance[event], resolved)
        : subscribeEntity(instance[event], ctx.entityIndex, entity, resolved);
    if (event === 'changeSubscriptions' || !isRelationPair(input) || !input.targetQuery) {
      return unsubscribe;
    }
    const stop = subscribeRelationFilter(
      ctx,
      instance,
      input,
      event === 'addSubscriptions',
      listener,
      entity
    );
    return () => {
      unsubscribe();
      stop();
    };
  });
}

/** Backs onAdd. With an entity it reports only that entity. */
export function subscribeAdd(
  ctx: WorldContext,
  entity: Entity | undefined,
  input: TraitHookInput,
  callback: Subscriber<any>
) {
  return subscribeTrait(ctx, entity, 'addSubscriptions', input, callback);
}

/** Backs onRemove. With an entity it reports only that entity. */
export function subscribeRemove(
  ctx: WorldContext,
  entity: Entity | undefined,
  input: TraitHookInput,
  callback: Subscriber<any>
) {
  return subscribeTrait(ctx, entity, 'removeSubscriptions', input, callback);
}

/** Backs onChange. With an entity it reports only that entity. */
export function subscribeChange(
  ctx: WorldContext,
  entity: Entity | undefined,
  input: TraitHookInput,
  callback: Subscriber<any>
) {
  return subscribeTrait(ctx, entity, 'changeSubscriptions', input, callback);
}

/**
 * The hooks of one relation filter in one world. An entity holds the filter's pair while one of
 * its targets matches the filter, so a target entering or leaving the filter adds or removes
 * that pair for every source of the target. A pair added to or removed from the entity itself
 * reaches the same subscribers through the relation's own subscriptions.
 */
function ensureRelationFilterHooks(
  ctx: WorldContext,
  instance: TraitInstance,
  pair: QueryRelationPair
): RelationFilterHooks {
  const index = (instance.relationFilterHooks ??= new Map());
  let hooks = index.get(pair);
  if (hooks !== undefined) return hooks;

  const filter = pair.targetQuery;
  const targetQuery = isQuery(filter) ? filter : createQuery(...(filter as QueryParameter[]));
  const added = createSubscriptions();
  const removed = createSubscriptions();
  // The filter reports a target once as it enters and once as it leaves.
  const notify = (subs: Subscriptions, target: Entity) => {
    const sources = getRelationSources(ctx, pair.relation as Relation<Trait>, target);
    for (let i = 0; i < sources.length; i++) emit(subs, sources[i], target);
  };
  const stopEnter = subscribeTargetQuery(ctx, targetQuery, (target) => notify(added, target), true);
  const stopExit = subscribeTargetQuery(ctx, targetQuery, (target) => notify(removed, target), false);

  hooks = {
    added,
    removed,
    stop: () => {
      stopEnter();
      stopExit();
    },
  };
  index.set(pair, hooks);
  return hooks;
}

/**
 * Subscribe to a relation filter's pair being added or removed by its target entering or leaving
 * the filter. With an entity, only that entity's pairs are reported.
 */
function subscribeRelationFilter(
  ctx: WorldContext,
  instance: TraitInstance,
  pair: QueryRelationPair,
  added: boolean,
  callback: Subscriber<any>,
  entity?: Entity
): () => void {
  const hooks = ensureRelationFilterHooks(ctx, instance, pair);
  const subs = added ? hooks.added : hooks.removed;
  const unsubscribe =
    entity === undefined
      ? subscribeAll(subs, callback)
      : subscribeEntity(subs, ctx.entityIndex, entity, callback);
  return () => {
    unsubscribe();
    const index = instance.relationFilterHooks!;
    if (hooks.added.count === 0 && hooks.removed.count === 0 && index.get(pair) === hooks) {
      hooks.stop();
      index.delete(pair);
    }
  };
}

/** Resolve the trait that backs a hook input so subscriptions attach to one trait instance. */
function resolveHookTrait(input: TraitHookInput): Trait {
  if (isIdentifierPair(input)) return input.identifier[$internal].trait;
  if (isRelationPair(input)) return input.relation[$internal].trait;
  return resolveTrait(input);
}

/** Exact terms filter by key or target. A relation wildcard observes every target. */
function resolveHookCallback(
  ctx: WorldContext,
  input: TraitHookInput,
  callback: Subscriber<any>
): Subscriber<any> {
  if (isIdentifierPair(input)) {
    return (entity, target) => {
      if (target === input.target) callback(entity, target);
    };
  }
  if (!isRelationPair(input)) return callback;

  const pairTargetQuery = input.targetQuery;
  if (pairTargetQuery) {
    const targetQuery = isQuery(pairTargetQuery) ? pairTargetQuery : createQuery(...pairTargetQuery);

    return (entity: Entity, target?: Entity) => {
      // The filter's member set answers for one target, so the cost does not follow its matches.
      if (target !== undefined && ensureQueryInstance(ctx, targetQuery).entities.has(target)) {
        callback(entity, target);
      }
    };
  }

  const pairTarget = input.target;
  if (pairTarget === '*') return callback;

  return (entity: Entity, target?: Entity) => {
    if (target === pairTarget) callback(entity, target);
  };
}

/** Backs onTraitRegistered. Reports every trait a world registers from now on. */
export function subscribeTraitRegistered(ctx: WorldContext, callback: (trait: Trait) => void) {
  return subscribeSet(ctx, ctx.traitRegisteredSubscriptions, callback);
}
