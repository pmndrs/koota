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

export function useTrait<T extends Trait>(
  target: () => Entity | World | undefined | null,
  trait: MaybeGetter<T | RelationPair<T>>
): { readonly current: TraitRecord<T> | undefined } {
  const resolveTarget = createTargetResolver();
  const initial = resolveTarget(target());
  const initialTrait = initial === undefined ? undefined : resolve(trait);
  let value = $state.raw<TraitRecord<T> | undefined>(
    initial !== undefined &&
      initialTrait !== undefined &&
      initial.world.has(initial.entity, initialTrait)
      ? initial.world.get(initial.entity, initialTrait)
      : undefined
  );
  // Version counter to force reactivity when the value reference is the same (AoS traits).
  // Only read in the getter, never in the effect.
  let version = $state(0);

  $effect(() => {
    const resolved = resolveTarget(target());

    if (resolved === undefined) {
      value = undefined;
      return;
    }

    const { world, entity } = resolved;

    const resolvedTrait = resolve(trait);
    const update = () => {
      value = world.isAlive(entity) ? world.get(entity, resolvedTrait) : undefined;
      untrack(() => version++);
    };
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

  return {
    get current() {
      void version;
      return value;
    },
  };
}
