import {
  type Entity,
  type RelationPair,
  type Trait,
  type TraitRecord,
  type World,
} from '@koota/core';
import { untrack } from 'svelte';
import { getTargetEntity } from '../utils/get-target-entity.js';
import { type MaybeGetter, resolve } from '../utils/resolve.js';

export function useTraitEffect<T extends Trait>(
  target: () => Entity | World,
  trait: MaybeGetter<T | RelationPair<T>>,
  callback: (value: TraitRecord<T> | undefined) => void
) {
  const notify = (value: TraitRecord<T> | undefined) => untrack(() => callback(value));

  $effect(() => {
    const t = target();
    const resolvedTrait = resolve(trait);
    const entity = getTargetEntity(t)!;

    const onChangeUnsub = entity.onChange(resolvedTrait, () => notify(entity.get(resolvedTrait)));
    const onAddUnsub = entity.onAdd(resolvedTrait, () => notify(entity.get(resolvedTrait)));
    const onRemoveUnsub = entity.onRemove(resolvedTrait, () => notify(undefined));

    notify(entity.has(resolvedTrait) ? entity.get(resolvedTrait) : undefined);

    return () => {
      onChangeUnsub();
      onAddUnsub();
      onRemoveUnsub();
    };
  });
}
