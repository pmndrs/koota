import {
  $internal,
  $relationPair,
  createQuery,
  shallowEqual,
  type Entity,
  type RelationPair,
  type World,
} from '@koota/core';
import { useEffect, useReducer } from 'react';

/** A world resolves to its world entity, registering a lazy world so it exists. */
export function resolveEntity(target: Entity | World | undefined | null): Entity | undefined {
  if (typeof target === 'number') return target;
  if (!target) return undefined;
  if (!target.isRegistered) target.add();
  return target[$internal].worldEntity;
}

type Target = Entity | World | undefined | null;
type Attach<T, I> = (entity: Entity, input: I, push: (value: T) => void) => () => void;
type GetVersionSource<I> = (entity: Entity, input: I) => { version: number } | undefined;
/** Snapshots share one subscription for the lifetime of a target and input. */
type Snapshot<T, I> = { binding: Binding<T, I>; value: T | undefined };
type Action<T, I> = Snapshot<T, I> | { replace: Snapshot<T, I> };
type Binding<T, I> = {
  target: Target;
  input: I;
  subscribe: (publish: (snapshot: Snapshot<T, I>) => void) => (() => void) | undefined;
  entity: Entity | undefined;
  value: T | undefined;
  source: { version: number } | undefined;
  version: number;
};

function queryRef(query: RelationPair['targetQuery']) {
  return Array.isArray(query) ? createQuery(...query) : query;
}

function sameInput(a: unknown, b: unknown) {
  if (a === b) return true;
  const left = a as RelationPair;
  const right = b as RelationPair;
  return (
    left[$relationPair] &&
    right[$relationPair] &&
    left.relation === right.relation &&
    left.target === right.target &&
    (left.targetQuery === right.targetQuery ||
      queryRef(left.targetQuery) === queryRef(right.targetQuery))
  );
}

function createSnapshot<T, I>(
  target: Target,
  input: I,
  read: (entity: Entity, input: I) => T,
  attach: Attach<T, I>,
  getVersionSource?: GetVersionSource<I>
): Snapshot<T, I> {
  const entity = resolveEntity(target);
  const alive = entity !== undefined && entity.isAlive();
  const value = alive ? read(entity, input) : undefined;
  const source = alive ? getVersionSource?.(entity, input) : undefined;
  const binding: Binding<T, I> = {
    target,
    input,
    entity,
    value,
    source,
    version: source?.version ?? 0,
    subscribe: (publish) => subscribe(binding, publish, read, attach, getVersionSource),
  };
  return { binding, value };
}

function observeEntity<T, I>(
  binding: Binding<T, I>,
  publish: (next: Snapshot<T, I>) => void,
  read: (entity: Entity, input: I) => T,
  attach: Attach<T, I>,
  getVersionSource?: GetVersionSource<I>
) {
  const { entity, input } = binding;
  if (!entity?.isAlive()) {
    if (binding.value !== undefined) {
      binding.value = undefined;
      publish({ binding, value: undefined });
    }
    return;
  }
  const push = (value: T | undefined) => {
    binding.value = value;
    binding.version = binding.source?.version ?? 0;
    publish({ binding, value });
  };
  const detach = attach(entity, input, push);
  // Catch writes before the subscription attached, including changes to an AoS object in place.
  if (getVersionSource) {
    const source = getVersionSource(entity, input);
    const replaced = binding.source !== undefined && binding.source !== source;
    binding.source = source;
    if (replaced || (source?.version ?? 0) !== binding.version) push(read(entity, input));
  } else {
    const latest = read(entity, input);
    if (!shallowEqual(latest, binding.value)) push(latest);
  }
  return detach;
}

function subscribe<T, I>(
  binding: Binding<T, I>,
  dispatch: (next: Snapshot<T, I>) => void,
  read: (entity: Entity, input: I) => T,
  attach: Attach<T, I>,
  getVersionSource?: GetVersionSource<I>
) {
  const { target } = binding;
  if (typeof target !== 'object' || !target)
    return observeEntity(binding, dispatch, read, attach, getVersionSource);
  // A reset replaces the world entity even when the observed trait was absent.
  const listen = () => {
    const entity = resolveEntity(target);
    if (entity !== binding.entity) {
      binding.entity = entity;
      binding.version = -1;
    }
    return observeEntity(binding, dispatch, read, attach, getVersionSource);
  };
  let detach = listen();
  const reset = () => {
    detach?.();
    detach = listen();
  };
  target[$internal].resetSubscriptions.add(reset);
  return () => {
    target[$internal].resetSubscriptions.delete(reset);
    detach?.();
  };
}

function reducer<T, I>(state: Snapshot<T, I>, next: Action<T, I>) {
  if ('replace' in next) return next.replace;
  // An old subscription may still emit before React cleans up its effect.
  return next.binding === state.binding ? next : state;
}

export function useEntityValue<T, I>(
  target: Target,
  input: I,
  read: (entity: Entity, input: I) => T,
  attach: Attach<T, I>,
  getVersionSource?: GetVersionSource<I>
): T | undefined {
  const [current, dispatch] = useReducer(reducer<T, I>, undefined, () =>
    createSnapshot(target, input, read, attach, getVersionSource)
  );
  let snapshot = current;
  if (current.binding.target !== target || !sameInput(current.binding.input, input)) {
    snapshot = createSnapshot(target, input, read, attach, getVersionSource);
    dispatch({ replace: snapshot });
  }
  const binding = snapshot.binding;
  useEffect(() => binding.subscribe(dispatch), [binding]);
  return snapshot.value;
}
