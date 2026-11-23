import {
  $internal as internal,
  type Entity,
  type Identifier,
  type IdentifierPair,
  type RelationPair,
  type Trait,
  type World,
} from '@koota/core';
import { getTargetEntity, observeTarget } from '../utils/get-target-entity.js';
import { type MaybeGetter, resolve } from '../utils/resolve.js';
import { useWorld } from '../world/world-context.js';

export function useHas(
  target: () => Entity | World | undefined | null,
  trait: MaybeGetter<Trait | RelationPair | Identifier | IdentifierPair>
): { readonly current: boolean } {
  useWorld();
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

      const observer = entity[internal].observeSettled(() => {
        value = entity.isAlive() && entity.has(resolvedTrait);
      });
      // The hook overloads take no union. Core resolves every input and filters exact terms by key.
      const onAdd = entity.onAdd(resolvedTrait as Trait, observer.invalidate);
      const onRemove = entity.onRemove(resolvedTrait as Trait, observer.invalidate);
      value = entity.has(resolvedTrait);
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
