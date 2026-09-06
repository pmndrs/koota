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

/** The value read from one entity for one input. Mutated in place by the subscription. */
type Snapshot<T, I> = { entity: Entity | undefined; input: I; value: T | undefined };

function snapshot<T, I>(
  entity: Entity | undefined,
  input: I,
  read: (entity: Entity, input: I) => T
): Snapshot<T, I> {
  return { entity, input, value: entity === undefined ? undefined : read(entity, input) };
}

/** State wraps the snapshot so a push re-renders while the snapshot stays the effect key. */
type State<T, I> = { current: Snapshot<T, I> };

function reducer<T, I>(state: State<T, I>, next: State<T, I> | null): State<T, I> {
  return next ?? { current: state.current };
}

/**
 * Read an entity value during render and subscribe to updates in an effect.
 * Check the value after subscribing to catch changes since render.
 */
export function useEntityValue<T, I>(
  target: Entity | World | undefined | null,
  input: I,
  read: (entity: Entity, input: I) => T,
  attach: Attach<T, I>
): T | undefined {
  const entity = resolveEntity(target);
  const [state, dispatch] = useReducer(reducer<T, I>, undefined, () => ({
    current: snapshot(entity, input, read),
  }));

  // A new entity or input swaps the snapshot during render so the value is never stale.
  let current = state.current;
  if (current.entity !== entity || !sameInput(current.input, input)) {
    current = snapshot(entity, input, read);
    dispatch({ current });
  }

  useEffect(() => {
    const entity = current.entity;
    if (entity === undefined) return;

    const push = (value: T) => {
      current.value = value;
      dispatch(null);
    };

    const detach = attach(entity, current.input, push);
    // Catch changes between render and subscribe.
    const latest = read(entity, current.input);
    if (!shallowEqual(latest, current.value)) push(latest);
    return detach;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current]);

  return current.value;
}
