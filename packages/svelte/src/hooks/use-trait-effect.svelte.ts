import {
  whenSettled,
  type Entity,
  type RelationPair,
  type Trait,
  type TraitRecord,
  type World,
} from '@koota/core';
import { untrack } from 'svelte';
import { createTargetResolver, subscribeTarget } from '../utils/get-target-entity.js';
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
    let current: ReturnType<typeof resolveTarget>;
    const update = () => {
      if (current !== undefined) {
        const { world, entity } = current;
        notify(world.has(entity) ? world.get(entity, resolvedTrait) : undefined);
      } else if (typeof subject === 'object') {
        notify(undefined);
      }
    };
    const attach = (resolved: ReturnType<typeof resolveTarget>) => {
      current = resolved;
      if (resolved === undefined) return;
      const { world, entity } = resolved;
      const observer = world[internal].observeSettled(update);
      const onChange = world.onChange(entity, resolvedTrait, observer.invalidate);
      const onRemove = world.onRemove(entity, resolvedTrait, observer.invalidate);
      return () => {
        onChange();
        onRemove();
      };
    };
    const stop = subscribeTarget(resolveTarget, subject, attach, update);
    try {
      update();
    } catch (error) {
      stop?.();
      throw error;
    }
    return stop;
  });
}
