import {
  Any,
  entityAt,
  entityInQuery,
  hasTraitUnchecked,
  isPair,
  isWildcardPair,
  observe,
  observeTyped,
  pairTargetIndex,
  watchType,
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

function hasSubscribers(subscriptions: TraitSubscriptions): boolean {
  return (
    subscriptions.add.size > 0 ||
    subscriptions.remove.size > 0 ||
    subscriptions.change.size > 0 ||
    subscriptions.byEntity.size > 0
  );
}

/**
 * Marks the trait watched in the kernel while it has any subscriber, so its
 * fused mutations take the general path that fires them, and clears the mark
 * once the last one leaves.
 */
function refreshWatch(state: WorldState, type: TypeId, subscriptions: TraitSubscriptions): void {
  if (state.kernel) watchType(state.kernel, type, hasSubscribers(subscriptions));
}

/** Marks every subscribed trait watched, for a kernel created after the subscriptions. */
export function watchSubscribedTraits(state: WorldState, kernel: Kernel): void {
  for (const [type, subscriptions] of state.traitSubscriptions) {
    if (hasSubscribers(subscriptions)) watchType(kernel, type, true);
  }
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
      const query = resolveQuery(
        state,
        parameters,
        isQuery(targetQuery) ? targetQuery.hash : undefined
      );
      if (query && entityInQuery(state.kernel, query, toLocal(state, target)))
        callback(entity, target);
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
  const type = trait[$internal].id;
  const subscriptions = ensureSubscriptions(state, type);
  const subscriber = resolveHookCallback(state, input, callback);
  if (entity === undefined) {
    subscriptions[event].add(subscriber);
    refreshWatch(state, type, subscriptions);
    return () => {
      subscriptions[event].delete(subscriber);
      refreshWatch(state, type, subscriptions);
    };
  }
  if (!isHandleAlive(entity)) return () => {};
  let scoped = subscriptions.byEntity.get(entity);
  if (!scoped) subscriptions.byEntity.set(entity, (scoped = createEventSubscribers()));
  // Plain callbacks dedupe by identity. Pair filters dedupe by callback as well.
  const key = subscriber === callback ? callback : subscriber;
  scoped[event].add(key);
  refreshWatch(state, type, subscriptions);
  return () => {
    const current = subscriptions.byEntity.get(entity);
    if (!current || current !== scoped) return;
    current[event].delete(key);
    if (current.add.size === 0 && current.remove.size === 0 && current.change.size === 0) {
      subscriptions.byEntity.delete(entity);
      refreshWatch(state, type, subscriptions);
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

/** Frees a destroyed entity's public handle and drops what the world kept for it. */
export function releaseEntity(state: WorldState, entity: Entity): void {
  releaseHandle(state, entity);
  if (state.hidden.size > 0) state.hidden.delete(entity);
  if (state.traitSubscriptions.size === 0) return;
  for (const [type, subscriptions] of state.traitSubscriptions) {
    if (subscriptions.byEntity.size > 0 && subscriptions.byEntity.delete(entity)) {
      refreshWatch(state, type, subscriptions);
    }
  }
}

/** Registers the created observer on the first spawn subscriber or queued spawn, so quiet spawns fire nothing. */
export function attachCreatedObserver(state: WorldState, kernel: Kernel): void {
  if (state.createdObserverAttached) return;
  state.createdObserverAttached = true;
  observe(kernel, 'entityCreated', (local) => {
    const entity = toPublic(state, local);
    if (state.reserved.size > 0) state.reserved.delete(handleIndex(entity));
    if (
      state.spawnSubscribers.size === 0 ||
      hasTraitUnchecked(kernel, local, IsExcluded[$internal].id)
    )
      return;
    for (const subscriber of state.spawnSubscribers) subscriber(entity);
  });
}

/** Registers the destroy observer on the first destroy subscriber, so unobserved worlds take the kernel's quiet destroy path. */
export function attachDestroyObserver(state: WorldState, kernel: Kernel): void {
  if (state.destroyObserverAttached) return;
  state.destroyObserverAttached = true;
  observe(kernel, 'entityDestroying', (local) => {
    const entity = toPublic(state, local);
    if (entity === state.worldEntity || state.destroySubscribers.size === 0) return;
    for (const subscriber of state.destroySubscribers) subscriber(entity);
  });
}

/** Registers the entity observers every world needs: handle release and destroy subscribers. */
export function attachObservers(state: WorldState, kernel: Kernel): void {
  if (state.spawnSubscribers.size > 0) attachCreatedObserver(state, kernel);

  if (state.destroySubscribers.size > 0) attachDestroyObserver(state, kernel);

  kernel.onDestroyed = (local) => releaseEntity(state, toPublic(state, local));
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

  observeTyped(kernel, 'traitAdded', (type, local) => {
    if (isPair(type) && isWildcardPair(type)) return;
    const trait = traitOfType(type);
    if (!trait) return;
    const subscriptions = state.traitSubscriptions.get(trait[$internal].id);
    if (subscriptions === undefined) return;
    dispatch(subscriptions, 'add', toPublic(state, local), pairTarget(state, kernel, type));
  });

  observeTyped(kernel, 'traitRemoving', (type, local) => {
    if (isPair(type) && isWildcardPair(type)) return;
    const trait = traitOfType(type);
    if (!trait) return;
    const subscriptions = state.traitSubscriptions.get(trait[$internal].id);
    if (subscriptions === undefined) return;
    dispatch(subscriptions, 'remove', toPublic(state, local), pairTarget(state, kernel, type));
  });

  observeTyped(kernel, 'traitChanged', (type, local) => {
    if (isPair(type) && isWildcardPair(type)) return;
    const trait = traitOfType(type);
    if (!trait) return;
    const subscriptions = state.traitSubscriptions.get(trait[$internal].id);
    if (subscriptions === undefined) return;
    dispatch(subscriptions, 'change', toPublic(state, local), pairTarget(state, kernel, type));
  });
}
