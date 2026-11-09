import {
  $internal as internal,
  type Entity,
  type Relation,
  type Trait,
  type World,
} from '@koota/core';
import { createTargetResolver } from '../utils/get-target-entity.js';
import { type MaybeGetter, resolve } from '../utils/resolve.js';

export function useTarget<T extends Trait>(
  target: () => Entity | World | undefined | null,
  relation: MaybeGetter<Relation<T>>
): { readonly current: Entity | undefined } {
  const resolveTarget = createTargetResolver();
  const initial = resolveTarget(target());
  let value = $state.raw<Entity | undefined>(
    initial === undefined ? undefined : initial.world.targetFor(initial.entity, resolve(relation))
  );

  $effect(() => {
    const resolved = resolveTarget(target());

    if (resolved === undefined) {
      value = undefined;
      return;
    }

    const { world, entity } = resolved;

    const resolvedRelation = resolve(relation);
    const update = () => {
      value = world.isAlive(entity) ? world.targetFor(entity, resolvedRelation) : undefined;
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
