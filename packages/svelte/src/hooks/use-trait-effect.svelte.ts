import {
  $internal as internal,
  type Entity,
  type RelationPair,
  type Trait,
  type TraitRecord,
  type World,
} from '@koota/core';
import { untrack } from 'svelte';
import { createTargetResolver } from '../utils/get-target-entity.js';
import { type MaybeGetter, resolve } from '../utils/resolve.js';

export function useTraitEffect<T extends Trait>(
  target: () => Entity | World,
  trait: MaybeGetter<T | RelationPair<T>>,
  callback: (value: TraitRecord<T> | undefined) => void
) {
  const notify = (value: TraitRecord<T> | undefined) => untrack(() => callback(value));

  const resolveTarget = createTargetResolver();

  $effect(() => {
    const resolved = resolveTarget(target());
    if (resolved === undefined) return;
    const { world, entity } = resolved;
    const resolvedTrait = resolve(trait);
    const update = () => notify(world.isAlive(entity) ? world.get(entity, resolvedTrait) : undefined);
    const observer = world[internal].observeSettled(update);
    const onChange = world.onChange(entity, resolvedTrait, observer.invalidate);
    const onRemove = world.onRemove(entity, resolvedTrait, observer.invalidate);
    update();
    return () => {
      observer.unsubscribe();
      onChange();
      onRemove();
    };
  });
}
