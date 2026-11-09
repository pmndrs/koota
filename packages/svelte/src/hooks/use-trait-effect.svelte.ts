import {
  whenSettled,
  type Entity,
  type RelationPair,
  type Trait,
  type TraitRecord,
  type World,
} from '@koota/core';
import { untrack } from 'svelte';
import { createTargetResolver, observeTarget } from '../utils/get-target-entity.js';
import { type MaybeGetter, resolve } from '../utils/resolve.js';

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
  const resolveTarget = createTargetResolver();
  const notify = (value: TraitRecord<T> | undefined) => untrack(() => callback(value));

  $effect(() => {
    const subject = target();
    const resolvedTrait = resolve(trait);
    return observeTarget(resolveTarget, subject, (resolved) => {
      if (resolved === undefined) {
        if (typeof subject === 'object') notify(undefined);
        return;
      }

      const { world, entity } = resolved;
      const update = () =>
        notify(world.isAlive(entity) ? world.get(entity, resolvedTrait) : undefined);
      const observer = world[internal].observeSettled(update);
      const onChange = world.onChange(entity, resolvedTrait, observer.invalidate);
      const onRemove = world.onRemove(entity, resolvedTrait, observer.invalidate);
      update();
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
