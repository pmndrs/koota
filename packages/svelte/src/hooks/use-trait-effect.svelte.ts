import {
  whenSettled,
  type Entity,
  type RelationPair,
  type Trait,
  type TraitRecord,
  type World,
} from '@koota/core';
import { untrack } from 'svelte';
import { subscribeTarget } from '../utils/get-target-entity.js';
import { type MaybeGetter, resolve } from '../utils/resolve.js';
import { useWorld } from '../world/world-context.js';

export function useTraitEffect<T extends Trait>(
  target: () => Entity | World,
  trait: T,
  callback: (value: TraitRecord<T> | undefined) => void
): void;
export function useTraitEffect<T extends Trait>(
  target: () => Entity | World,
  trait: MaybeGetter<T | RelationPair<T>>,
  callback: (value: TraitRecord<T> | undefined) => void
): void;
export function useTraitEffect<T extends Trait>(
  target: () => Entity | World,
  trait: MaybeGetter<T | RelationPair<T>>,
  callback: (value: TraitRecord<T> | undefined) => void
) {
  useWorld();
  const notify = (value: TraitRecord<T> | undefined) => untrack(() => callback(value));

  $effect(() => {
    const subject = target();
    const resolvedTrait = resolve(trait);
    let current: Entity | undefined;
    const update = () => {
      if (current !== undefined) notify(current.isAlive() ? current.get(resolvedTrait) : undefined);
      else if (typeof subject === 'object') notify(undefined);
    };
    const attach = (entity: Entity | undefined) => {
      current = entity;
      if (entity === undefined) return;
      const refresh = whenSettled(update);
      const onChange = entity.onChange(resolvedTrait, refresh);
      const onRemove = entity.onRemove(resolvedTrait, refresh);
      return () => {
        onChange();
        onRemove();
      };
    };
    const stop = subscribeTarget(subject, attach, update);
    try {
      update();
    } catch (error) {
      stop?.();
      throw error;
    }
    return stop;
  });
}
