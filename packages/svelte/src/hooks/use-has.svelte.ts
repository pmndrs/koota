import { $internal as internal } from '@koota/core';
import { observeSettled } from '../utils/observe-settled.js';
import { type Entity, type RelationPair, type Trait, type World } from '@koota/core';
import { getTargetEntity } from '../utils/get-target-entity.js';
import { type MaybeGetter, resolve } from '../utils/resolve.js';

export function useHas(
  target: () => Entity | World | undefined | null,
  trait: MaybeGetter<Trait | RelationPair>
): { readonly current: boolean } {
  const initialEntity = getTargetEntity(target());
  let value = $state(initialEntity?.has(resolve(trait)) ?? false);

  $effect(() => {
    const entity = getTargetEntity(target());

    if (entity === undefined) {
      value = false;
      return;
    }

    const resolvedTrait = resolve(trait);
    const update = () => {
      value = entity.isAlive() && entity.has(resolvedTrait);
    };
    const observer = observeSettled(entity[internal], update);
    const onAdd = entity.onAdd(resolvedTrait, observer.invalidate);
    const onRemove = entity.onRemove(resolvedTrait, observer.invalidate);
    update();
    return () => {
      observer.unsubscribe();
      onAdd();
      onRemove();
    };
  });

  return {
    get current() {
      return value;
    },
  };
}
