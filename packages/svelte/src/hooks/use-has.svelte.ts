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

      const detach = entity[internal].observeHas(entity, resolvedTrait, (present) => {
        value = present;
      });
      value = entity.has(resolvedTrait);
      return detach;
    });
  });

  return {
    get current() {
      return value;
    },
  };
}
