import {
  $internal as internal,
  type Entity,
  type RelationPair,
  type Trait,
  type TraitRecord,
  type World,
} from '@koota/core';
import { untrack } from 'svelte';
import { getTargetEntity, observeTarget } from '../utils/get-target-entity.js';
import { type MaybeGetter, resolve } from '../utils/resolve.js';
import { useWorld } from '../world/world-context.js';

export function useTrait<T extends Trait>(
  target: () => Entity | World | undefined | null,
  trait: T
): { readonly current: TraitRecord<T> | undefined };
export function useTrait<T extends Trait>(
  target: () => Entity | World | undefined | null,
  trait: MaybeGetter<T | RelationPair<T>>
): { readonly current: TraitRecord<T> | undefined };
export function useTrait<T extends Trait>(
  target: () => Entity | World | undefined | null,
  trait: MaybeGetter<T | RelationPair<T>>
): { readonly current: TraitRecord<T> | undefined } {
  useWorld();
  const initialEntity = getTargetEntity(target());
  const initialTrait = initialEntity === undefined ? undefined : resolve(trait);
  let value = $state.raw<TraitRecord<T> | undefined>(
    initialEntity !== undefined && initialTrait !== undefined && initialEntity.has(initialTrait)
      ? initialEntity.get(initialTrait)
      : undefined
  );
  // Version counter to force reactivity when the value reference is the same (AoS traits).
  // Only read in the getter, never in the effect.
  let version = $state(0);

  $effect(() => {
    const subject = target();
    const resolvedTrait = resolve(trait);
    return observeTarget(subject, (entity) => {
      if (entity === undefined) {
        value = undefined;
        return;
      }

      const update = () => {
        value = entity.isAlive() ? entity.get(resolvedTrait) : undefined;
        untrack(() => version++);
      };
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

  return {
    get current() {
      void version;
      return value;
    },
  };
}
