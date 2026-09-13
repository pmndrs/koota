import {
  Any,
  entityAt,
  entityInQuery,
  hasTraitUnchecked,
  isPair,
  isWildcardPair,
  observe,
  pairTargetIndex,
  type TypeId,
  type World as Kernel,
} from '../../kernel';
import type { Entity } from '../entity/types';
import { handleIndex, isHandleAlive, releaseHandle, toLocal, toPublic } from '../handles';
import { IsExcluded, isQuery, resolveQuery } from '../query/query';
import { isRelation, isRelationPair } from '../relation/relation';
import type { Relation, RelationPair } from '../relation/types';
import { $internal } from '../symbols';
import { traitOfType } from '../trait/trait';
import type { Trait } from '../trait/types';
import type { EventSubscribers, Subscriber, TraitSubscriptions, WorldState } from './state';

export type HookInput = Trait | Relation<Trait> | RelationPair<Trait>;

function createEventSubscribers(): EventSubscribers {
  return { add: new Set(), remove: new Set(), change: new Set() };
}

function ensureSubscriptions(state: WorldState, type: TypeId): TraitSubscriptions {
  let subscriptions = state.traitSubscriptions.get(type);
  if (!subscriptions) {
    subscriptions = { ...createEventSubscribers(), byEntity: new Map() };
    state.traitSubscriptions.set(type, subscriptions);
  }
  return subscriptions;
}

/** The trait backing a hook input. Relations and pairs resolve to the relation trait. */
export function resolveHookTrait(input: HookInput): Trait {
  if (isRelationPair(input)) return input.relation[$internal].trait;
  if (isRelation(input)) return input[$internal].trait;
  return input;
}

/** Wrap a hook callback so relation pairs only fire for their target. */
export function resolveHookCallback(
  state: WorldState,
  input: HookInput,
  callback: (entity: Entity, target?: Entity) => void
): Subscriber {
  if (!isRelationPair(input)) return callback;
  const targetQuery = input.targetQuery;
  if (targetQuery) {
    const parameters = isQuery(targetQuery) ? targetQuery.parameters : targetQuery;
    return (entity, target) => {
      if (target === undefined || !state.kernel) return;
      const query = resolveQuery(state, parameters, isQuery(targetQuery) ? targetQuery.hash : undefined);
      if (query && entityInQuery(state.kernel, query, toLocal(state, target))) callback(entity, target);
    };
  }
  const pairTarget = input.target;
  if (pairTarget === '*') return callback;
  return (entity, target) => {
    if (target === pairTarget) callback(entity, target);
  };
}

export function subscribeTrait(
  state: WorldState,
  input: HookInput,
  event: 'add' | 'remove' | 'change',
  callback: (entity: Entity, target?: Entity) => void,
  entity?: Entity
): () => void {
  if (!state.traitObserversAttached && state.kernel) attachTraitObservers(state, state.kernel);
  const trait = resolveHookTrait(input);
  const subscriptions = ensureSubscriptions(state, trait[$internal].id);
  const subscriber = resolveHookCallback(state, input, callback);
  if (entity === undefined) {
    subscriptions[event].add(subscriber);
    return () => {
      subscriptions[event].delete(subscriber);
    };
  }
  if (!isHandleAlive(entity)) return () => {};
  let scoped = subscriptions.byEntity.get(entity);
  if (!scoped) subscriptions.byEntity.set(entity, (scoped = createEventSubscribers()));
  // Plain callbacks dedupe by identity. Pair filters dedupe by callback as well.
  const key = subscriber === callback ? callback : subscriber;
  scoped[event].add(key);
  return () => {
    const current = subscriptions.byEntity.get(entity);
    if (!current || current !== scoped) return;
    current[event].delete(key);
    if (current.add.size === 0 && current.remove.size === 0 && current.change.size === 0) {
      subscriptions.byEntity.delete(entity);
    }
  };
}

function dispatch(
  subscriptions: TraitSubscriptions,
  event: 'add' | 'remove' | 'change',
  entity: Entity,
  target: Entity | undefined
): void {
  const all = subscriptions[event];
  if (all.size > 0) {
    if (target === undefined) for (const subscriber of all) subscriber(entity);
    else for (const subscriber of all) subscriber(entity, target);
  }
  if (subscriptions.byEntity.size === 0) return;
  const scoped = subscriptions.byEntity.get(entity);
  if (!scoped) return;
  const set = scoped[event];
  if (target === undefined) for (const subscriber of set) subscriber(entity);
  else for (const subscriber of set) subscriber(entity, target);
}

function pairTarget(state: WorldState, kernel: Kernel, type: TypeId): Entity | undefined {
  if (!isPair(type)) return undefined;
  const targetIndex = pairTargetIndex(type);
  if (targetIndex === Any) return undefined;
  return toPublic(state, entityAt(kernel, targetIndex));
}

/** Registers the entity observers every world needs: handle release and destroy subscribers. */
export function attachObservers(state: WorldState, kernel: Kernel): void {
  observe(kernel, 'entityCreated', (local) => {
    const entity = toPublic(state, local);
    if (state.reserved.size > 0) state.reserved.delete(handleIndex(entity));
    if (state.spawnSubscribers.size === 0 || hasTraitUnchecked(kernel, local, IsExcluded[$internal].id)) return;
    for (const subscriber of state.spawnSubscribers) subscriber(entity);
  });

  observe(kernel, 'entityDestroying', (local) => {
    const entity = toPublic(state, local);
    if (entity === state.worldEntity || state.destroySubscribers.size === 0) return;
    for (const subscriber of state.destroySubscribers) subscriber(entity);
  });

  observe(kernel, 'entityDestroyed', (local) => {
    const entity = toPublic(state, local);
    releaseHandle(state, entity);
    if (state.hidden.size > 0) state.hidden.delete(entity);
    if (state.traitSubscriptions.size === 0) return;
    for (const subscriptions of state.traitSubscriptions.values()) {
      if (subscriptions.byEntity.size > 0) subscriptions.byEntity.delete(entity);
    }
  });
}

/**
 * Registers the trait observers that drive add, remove, and change
 * subscriptions. They attach on the first subscription, so a world nobody
 * observes pays nothing per mutation. Hooks do not pass through here; the
 * kernel runs them from the mutation path.
 */
export function attachTraitObservers(state: WorldState, kernel: Kernel): void {
  if (state.traitObserversAttached) return;
  state.traitObserversAttached = true;

  observe(kernel, 'traitAdded', (type, local) => {
    if (isPair(type) && isWildcardPair(type)) return;
    const trait = traitOfType(type);
    if (!trait) return;
    const subscriptions = state.traitSubscriptions.get(trait[$internal].id);
    if (subscriptions === undefined) return;
    dispatch(subscriptions, 'add', toPublic(state, local), pairTarget(state, kernel, type));
  });

  observe(kernel, 'traitRemoving', (type, local) => {
    if (isPair(type) && isWildcardPair(type)) return;
    const trait = traitOfType(type);
    if (!trait) return;
    const subscriptions = state.traitSubscriptions.get(trait[$internal].id);
    if (subscriptions === undefined) return;
    dispatch(subscriptions, 'remove', toPublic(state, local), pairTarget(state, kernel, type));
  });

  observe(kernel, 'traitChanged', (type, local) => {
    if (isPair(type) && isWildcardPair(type)) return;
    const trait = traitOfType(type);
    if (!trait) return;
    const subscriptions = state.traitSubscriptions.get(trait[$internal].id);
    if (subscriptions === undefined) return;
    dispatch(subscriptions, 'change', toPublic(state, local), pairTarget(state, kernel, type));
  });
}
