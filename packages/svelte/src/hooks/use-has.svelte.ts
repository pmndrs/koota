import {
  $internal as internal,
  type Entity,
  type RelationPair,
  type Trait,
  type World,
} from '@koota/core';
import { getTargetEntity, observeTarget } from '../utils/get-target-entity.js';
import { type MaybeGetter, resolve } from '../utils/resolve.js';

export function useHas(
  target: () => Entity | World | undefined | null,
  trait: MaybeGetter<Trait | RelationPair>
): { readonly current: boolean } {
  const initialEntity = getTargetEntity(target());
  let value = $state(initialEntity?.has(resolve(trait)) ?? false);

  $effect(() => {
    const subject = target();
    const resolvedTrait = resolve(trait);
    return observeTarget(subject, (entity) => {
      if (entity === undefined) {
        value = false;
        return;
      }

      const update = () => {
        value = entity.isAlive() && entity.has(resolvedTrait);
      };
      const observer = entity[internal].observeSettled(update);
      const onAdd = entity.onAdd(resolvedTrait, observer.invalidate);
      const onRemove = entity.onRemove(resolvedTrait, observer.invalidate);
      update();
      return () => {
        observer.unsubscribe();
        onAdd();
        onRemove();
      };
    });
  });

  return {
    get current() {
      return value;
    },
  };
}
