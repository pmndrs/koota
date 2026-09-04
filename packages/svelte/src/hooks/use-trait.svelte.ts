import {
  type Entity,
  type RelationPair,
  type Trait,
  type TraitRecord,
  type World,
} from '@koota/core';
import { untrack } from 'svelte';
import { getTargetEntity } from '../utils/get-target-entity.js';
import { isWorld } from '../utils/is-world.js';
import { type MaybeGetter, resolve } from '../utils/resolve.js';
import { useWorld } from '../world/world-context.js';

export function useTrait<T extends Trait>(
  target: () => Entity | World | undefined | null,
  trait: MaybeGetter<T | RelationPair<T>>
): { readonly current: TraitRecord<T> | undefined } {
  const contextWorld = useWorld();
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
    const t = target();

    if (!t) {
      value = undefined;
      return;
    }

    const resolvedTrait = resolve(trait);
    const world = isWorld(t) ? t : contextWorld;
    let entity: Entity;

    /**
     * Subscribe before reading worldEntity: world.onChange triggers lazy
     * registration so worldEntity is guaranteed to exist after this.
     */
    const onChangeUnsub = world.onChange(resolvedTrait, (e) => {
      if (e === entity) {
        value = e.get(resolvedTrait);
        untrack(() => version++);
      }
    });

    const onAddUnsub = world.onAdd(resolvedTrait, (e) => {
      if (e === entity) value = e.get(resolvedTrait);
    });

    const onRemoveUnsub = world.onRemove(resolvedTrait, (e) => {
      if (e === entity) value = undefined;
    });

    entity = getTargetEntity(t)!;
    value = entity.has(resolvedTrait) ? entity.get(resolvedTrait) : undefined;

    return () => {
      onChangeUnsub();
      onAddUnsub();
      onRemoveUnsub();
    };
  });

  return {
    get current() {
      void version;
      return value;
    },
  };
}
