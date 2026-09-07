import {
  $internal,
  $relationPair,
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

/** Relation pairs are equal when their relation and target match. */
export function sameInput(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  const pairA = a as RelationPair;
  const pairB = b as RelationPair;
  return (
    !!pairA[$relationPair] &&
    !!pairB[$relationPair] &&
    pairA.relation === pairB.relation &&
    pairA.target === pairB.target
  );
}

export type Attach<T, I> = (entity: Entity, input: I, push: (value: T) => void) => () => void;

type VersionSource = { version: number };
type GetVersionSource<I> = (entity: Entity, input: I) => VersionSource | undefined;

/** Live cache for one entity and input, stable for the subscription lifetime. */
type Binding<T, I> = {
  entity: Entity | undefined;
  input: I;
  value: T | undefined;
  version: number;
  versionSource: VersionSource | undefined;
};

type State<T, I> = { binding: Binding<T, I> };
type Action<T, I> = Binding<T, I> | { replace: Binding<T, I> };

function createBinding<T, I>(
  entity: Entity | undefined,
  input: I,
  read: (entity: Entity, input: I) => T,
  getVersionSource?: GetVersionSource<I>
): Binding<T, I> {
  const value = entity === undefined ? undefined : read(entity, input);
  const versionSource = entity === undefined ? undefined : getVersionSource?.(entity, input);
  return { entity, input, value, version: versionSource?.version ?? 0, versionSource };
}

function reducer<T, I>(state: State<T, I>, next: Action<T, I>): State<T, I> {
  if ('replace' in next) return { binding: next.replace };
  // A previous subscription may still emit before its effect is cleaned up.
  return next === state.binding ? { binding: next } : state;
}

/**
 * Read an entity value during render and subscribe to updates in an effect.
 * Check the value after subscribing to catch changes since render.
 */
export function useEntityValue<T, I>(
  target: Entity | World | undefined | null,
  input: I,
  read: (entity: Entity, input: I) => T,
  attach: Attach<T, I>,
  getVersionSource?: GetVersionSource<I>
): T | undefined {
  const entity = resolveEntity(target);
  const [state, dispatch] = useReducer(reducer<T, I>, undefined, () => ({
    binding: createBinding(entity, input, read, getVersionSource),
  }));

  // Read a new binding during render so a target switch never displays the old value.
  let binding = state.binding;
  if (binding.entity !== entity || !sameInput(binding.input, input)) {
    binding = createBinding(entity, input, read, getVersionSource);
    dispatch({ replace: binding });
  }

  // Capture what this render used before subscription callbacks can update the cache.
  const { value, version } = binding;

  useEffect(() => {
    const entity = binding.entity;
    if (entity === undefined) return;

    const push = (value: T) => {
      binding.value = value;
      binding.version = binding.versionSource?.version ?? 0;
      dispatch(binding);
    };

    const detach = attach(entity, binding.input, push);
    // Catch changes between render and subscribe.
    if (getVersionSource) {
      const source = getVersionSource(entity, binding.input);
      // A reset can replace the source with one at the same version.
      const replaced = binding.versionSource !== undefined && binding.versionSource !== source;
      binding.versionSource = source;
      if (replaced || version !== (source?.version ?? 0)) {
        push(read(entity, binding.input));
      }
    } else {
      const latest = read(entity, binding.input);
      if (!shallowEqual(latest, value)) push(latest);
    }
    return detach;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [binding]);

  return value;
}
