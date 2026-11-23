import {
  $internal as internal,
  type Entity,
  type RelationPair,
  type Trait,
  type TraitRecord,
  type World,
} from '@koota/core';
import { untrack } from 'svelte';
import { observeTarget } from '../utils/get-target-entity.js';
import { type MaybeGetter, resolve } from '../utils/resolve.js';

export function useTraitEffect<T extends Trait>(
  target: () => Entity | World,
  trait: MaybeGetter<T | RelationPair<T>>,
  callback: (value: TraitRecord<T> | undefined) => void
) {
  const notify = (value: TraitRecord<T> | undefined) => untrack(() => callback(value));

  $effect(() => {
    const subject = target();
    const resolvedTrait = resolve(trait);
    return observeTarget(subject, (entity) => {
      if (entity === undefined) {
        if (typeof subject === 'object') notify(undefined);
        return;
      }

      const update = () => notify(entity.isAlive() ? entity.get(resolvedTrait) : undefined);
      const observer = entity[internal].observeSettled(update);
      const onChange = entity.onChange(resolvedTrait, observer.invalidate);
      const onRemove = entity.onRemove(resolvedTrait, observer.invalidate);
      update();
      return () => {
        observer.unsubscribe();
        onChange();
        onRemove();
      };
    });
  });
}
