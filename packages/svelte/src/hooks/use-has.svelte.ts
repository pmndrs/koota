import {
  $internal as internal,
  type Entity,
  type RelationPair,
  type Trait,
  type World,
} from '@koota/core';
import { createTargetResolver } from '../utils/get-target-entity.js';
import { type MaybeGetter, resolve } from '../utils/resolve.js';

export function useHas(
  target: () => Entity | World | undefined | null,
  trait: MaybeGetter<Trait | RelationPair>
): { readonly current: boolean } {
  const resolveTarget = createTargetResolver();
  const initial = resolveTarget(target());
  let value = $state(
    initial === undefined ? false : initial.world.has(initial.entity, resolve(trait))
  );

  $effect(() => {
    const resolved = resolveTarget(target());

    if (resolved === undefined) {
      value = false;
      return;
    }

    const { world, entity } = resolved;

    const resolvedTrait = resolve(trait);
    const update = () => {
      value = world.isAlive(entity) && world.has(entity, resolvedTrait);
    };
    const observer = world[internal].observeSettled(update);
    const onAdd = world.onAdd(entity, resolvedTrait, observer.invalidate);
    const onRemove = world.onRemove(entity, resolvedTrait, observer.invalidate);
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
