import {
  $internal,
  $identifierPair,
  $relationPair,
  createQuery,
  type Entity,
  type IdentifierPair,
  type RelationPair,
  type World,
} from '@koota/core';
import { useEffect, useReducer } from 'react';
import { useWorld } from '../world/use-world';

/** A world resolves to its world entity, which a destroyed world no longer has. */
export function resolveEntity(target: Entity | World | undefined | null): Entity | undefined {
  if (typeof target === 'number') return target;
  if (!target) return undefined;
  return target[$internal].worldEntity ?? undefined;
}

/**
 * Every hook needs a provider. An entity is read through the provided world and a world target
 * through itself.
 */
export function useResolvedWorld(target: Entity | World | undefined | null): World | undefined {
  const provided = useWorld();
  return typeof target === 'number' ? provided : (target ?? undefined);
}

type Target = Entity | World | undefined | null;
type Read<T, I> = (world: World, entity: Entity, input: I, previous?: T) => T;
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
  const alive = world !== undefined && entity !== undefined && world.has(entity);
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
    subscribe: (publish) =>
      subscribeTarget(target, (entity) => {
        if (entity !== binding.entity) {
          binding.entity = entity;
          binding.version = -1;
        }
        return subscribeEntity(binding, publish, read, attach, getVersionSource);
      }),
  };
  return { binding, value };
}

function subscribeEntity<T, I>(
  binding: Binding<T, I>,
  publish: (next: Snapshot<T, I>) => void,
  read: Read<T, I>,
  attach: Attach<T, I>,
  getVersionSource?: GetVersionSource<I>
) {
  const { world, entity, input } = binding;
  if (world === undefined || entity === undefined || !world.has(entity)) {
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
    const latest = read(world, entity, input, binding.value);
    if (latest !== binding.value) push(latest);
  }
  return detach;
}

export function subscribeTarget(
  target: Target,
  attach: (entity: Entity | undefined) => (() => void) | undefined,
  afterReset?: () => void
) {
  if (typeof target === 'number' || target == null) return attach(target ?? undefined);
  const ctx = target[$internal];
  const bind = () => attach(ctx.worldEntity ?? undefined);
  let detach = bind();
  const reset = () => {
    detach?.();
    detach = bind();
    afterReset?.();
  };
  ctx.resetSubscriptions.add(reset);
  return () => {
    ctx.resetSubscriptions.delete(reset);
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
  const world = useResolvedWorld(target);
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
