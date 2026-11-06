import {
  $internal,
  $identifierPair,
  $relationPair,
  createQuery,
  shallowEqual,
  type Entity,
  type IdentifierPair,
  type RelationPair,
  type World,
} from '@koota/core';
import { useContext, useEffect, useReducer } from 'react';
import { WorldContext } from '../world/world-context';

/** A world resolves to its world entity, which a destroyed world no longer has. */
export function resolveEntity(target: Entity | World | undefined | null): Entity | undefined {
  if (typeof target === 'number') return target;
  if (!target) return undefined;
  return target[$internal].worldEntity ?? undefined;
}

/**
 * An entity is a bare id, so it is read through the world from the provider. A world target is
 * its own world and needs no provider.
 */
export function resolveWorld(target: Entity | World | undefined | null, provided: World | null) {
  if (typeof target !== 'number') return target ?? undefined;
  if (!provided) throw new Error('Koota: reading an entity needs a WorldProvider above the hook.');
  return provided;
}

type Target = Entity | World | undefined | null;
type Read<T, I> = (world: World, entity: Entity, input: I) => T;
type Attach<T, I> = (world: World, entity: Entity, input: I, push: (value: T) => void) => () => void;
type GetVersionSource<I> = (
  world: World,
  entity: Entity,
  input: I
) => { version: number } | undefined;
/** Snapshots share one subscription for the lifetime of a target and input. */
type Snapshot<T, I> = { binding: Binding<T, I>; value: T | undefined };
type Action<T, I> = Snapshot<T, I> | { replace: Snapshot<T, I> };
type Binding<T, I> = {
  target: Target;
  world: World | undefined;
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
  const left = a as RelationPair | IdentifierPair;
  const right = b as RelationPair | IdentifierPair;
  if ($identifierPair in left && $identifierPair in right) {
    return left.identifier === right.identifier && left.target === right.target;
  }
  return (
    $relationPair in left &&
    $relationPair in right &&
    left.relation === right.relation &&
    left.target === right.target &&
    (left.targetQuery === right.targetQuery ||
      queryRef(left.targetQuery) === queryRef(right.targetQuery))
  );
}

function createSnapshot<T, I>(
  target: Target,
  world: World | undefined,
  input: I,
  read: Read<T, I>,
  attach: Attach<T, I>,
  getVersionSource?: GetVersionSource<I>
): Snapshot<T, I> {
  const entity = resolveEntity(target);
  const alive = world !== undefined && entity !== undefined && world.isAlive(entity);
  const value = alive ? read(world, entity, input) : undefined;
  const source = alive ? getVersionSource?.(world, entity, input) : undefined;
  const binding: Binding<T, I> = {
    target,
    world,
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
  read: Read<T, I>,
  attach: Attach<T, I>,
  getVersionSource?: GetVersionSource<I>
) {
  const { world, entity, input } = binding;
  if (world === undefined || entity === undefined || !world.isAlive(entity)) {
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
  const detach = attach(world, entity, input, push);
  // Catch writes before the subscription attached, including changes to an AoS object in place.
  if (getVersionSource) {
    const source = getVersionSource(world, entity, input);
    const replaced = binding.source !== undefined && binding.source !== source;
    binding.source = source;
    if (replaced || (source?.version ?? 0) !== binding.version) push(read(world, entity, input));
  } else {
    const latest = read(world, entity, input);
    if (!shallowEqual(latest, binding.value)) push(latest);
  }
  return detach;
}

function subscribe<T, I>(
  binding: Binding<T, I>,
  dispatch: (next: Snapshot<T, I>) => void,
  read: Read<T, I>,
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
  read: Read<T, I>,
  attach: Attach<T, I>,
  getVersionSource?: GetVersionSource<I>
): T | undefined {
  const world = resolveWorld(target, useContext(WorldContext));
  const [current, dispatch] = useReducer(reducer<T, I>, undefined, () =>
    createSnapshot(target, world, input, read, attach, getVersionSource)
  );
  let snapshot = current;
  if (
    current.binding.target !== target ||
    current.binding.world !== world ||
    !sameInput(current.binding.input, input)
  ) {
    snapshot = createSnapshot(target, world, input, read, attach, getVersionSource);
    dispatch({ replace: snapshot });
  }
  const binding = snapshot.binding;
  useEffect(() => binding.subscribe(dispatch), [binding]);
  return snapshot.value;
}
