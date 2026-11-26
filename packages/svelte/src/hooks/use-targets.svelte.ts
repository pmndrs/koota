import { whenSettled, type Entity, type Relation, type Trait, type World } from '@koota/core';
import { createTargetResolver, subscribeTarget } from '../utils/get-target-entity.js';
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
    const subject = target();
    const resolvedRelation = resolve(relation);
    return subscribeTarget(resolveTarget, subject, (resolved) => {
      if (resolved === undefined) {
        value = [];
        return;
      }

      const { world, entity } = resolved;
      const update = () => {
        value = world.has(entity) ? world.targetsFor(entity, resolvedRelation) : [];
      };
      const refresh = whenSettled(update);
      const onChange = world.onChange(entity, resolvedRelation, refresh);
      const onRemove = world.onRemove(entity, resolvedRelation, refresh);
      update();
      return () => {
        onChange();
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
