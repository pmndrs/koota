import {
  whenSettled,
  type Entity,
  type Identifier,
  type IdentifierPair,
  type RelationPair,
  type Trait,
  type World,
} from '@koota/core';
import { createTargetResolver, observeTarget } from '../utils/get-target-entity.js';
import { type MaybeGetter, resolve } from '../utils/resolve.js';

export function useHas(
  target: () => Entity | World | undefined | null,
  trait: MaybeGetter<Trait | RelationPair | Identifier | IdentifierPair>
): { readonly current: boolean } {
  const resolveTarget = createTargetResolver();
  const initial = resolveTarget(target());
  let value = $state(
    initial === undefined ? false : initial.world.has(initial.entity, resolve(trait))
  );

  $effect(() => {
    const subject = target();
    const resolvedTrait = resolve(trait);
    return observeTarget(resolveTarget, subject, (resolved) => {
      if (resolved === undefined) {
        value = false;
        return;
      }

      const { world, entity } = resolved;
      const observer = world[internal].observeSettled(() => {
        value = world.has(entity) && world.has(entity, resolvedTrait);
      });
      // The hook overloads take no union. Core resolves every input and filters exact terms by key.
      const onAdd = world.onAdd(entity, resolvedTrait as Trait, observer.invalidate);
      const onRemove = world.onRemove(entity, resolvedTrait as Trait, observer.invalidate);
      value = world.has(entity, resolvedTrait);
      return () => {
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
