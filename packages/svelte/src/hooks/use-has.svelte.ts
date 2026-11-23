import type { Entity, Identifier, IdentifierPair, RelationPair, Trait, World } from '@koota/core';
import { attachHas } from '../utils/attach-has.js';
import { getTargetEntity, observeTarget } from '../utils/get-target-entity.js';
import { isWorld } from '../utils/is-world.js';
import { type MaybeGetter, resolve } from '../utils/resolve.js';
import { useWorld } from '../world/world-context.js';

export function useHas(
  target: () => Entity | World | undefined | null,
  trait: MaybeGetter<Trait | RelationPair | Identifier | IdentifierPair>
): { readonly current: boolean } {
  const provided = useWorld();
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

      const world = subject != null && isWorld(subject) ? subject : provided;
      const detach = attachHas(world, entity, resolvedTrait, () => {
        value = entity.isAlive() && entity.has(resolvedTrait);
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
