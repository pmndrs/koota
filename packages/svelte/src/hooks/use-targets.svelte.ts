import {
  $internal as internal,
  type Entity,
  type Relation,
  type Trait,
  type World,
} from '@koota/core';
import { createTargetResolver } from '../utils/get-target-entity.js';
import { type MaybeGetter, resolve } from '../utils/resolve.js';

export function useTargets<T extends Trait>(
  target: () => Entity | World | undefined | null,
  relation: MaybeGetter<Relation<T>>
): { readonly current: Entity[] } {
  const resolveTarget = createTargetResolver();
  const initial = resolveTarget(target());
  let value = $state.raw<Entity[]>(
    initial === undefined ? [] : initial.world.targetsFor(initial.entity, resolve(relation))
  );

  $effect(() => {
    const resolved = resolveTarget(target());

    if (resolved === undefined) {
      value = [];
      return;
    }

    const { world, entity } = resolved;

    const resolvedRelation = resolve(relation);
    const update = () => {
      value = world.isAlive(entity) ? world.targetsFor(entity, resolvedRelation) : [];
    };
    const observer = world[internal].observeSettled(update);
    const onChange = world.onChange(entity, resolvedRelation, observer.invalidate);
    const onRemove = world.onRemove(entity, resolvedRelation, observer.invalidate);
    update();
    return () => {
      observer.unsubscribe();
      onChange();
      onRemove();
    };
  });

  return {
    get current() {
      return value;
    },
  };
}
