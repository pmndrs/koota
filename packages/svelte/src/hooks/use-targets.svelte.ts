import { whenSettled, type Entity, type Relation, type Trait, type World } from '@koota/core';
import { getTargetEntity, subscribeTarget } from '../utils/get-target-entity.js';
import { type MaybeGetter, resolve } from '../utils/resolve.js';
import { useWorld } from '../world/world-context.js';

export function useTargets<T extends Trait>(
  target: () => Entity | World | undefined | null,
  relation: MaybeGetter<Relation<T>>
): { readonly current: Entity[] } {
  useWorld();
  const initialEntity = getTargetEntity(target());
  let value = $state.raw<Entity[]>(initialEntity?.targetsFor(resolve(relation)) ?? []);

  $effect(() => {
    const subject = target();
    const resolvedRelation = resolve(relation);
    return subscribeTarget(subject, (entity) => {
      if (entity === undefined) {
        value = [];
        return;
      }

      const update = () => {
        value = entity.isAlive() ? entity.targetsFor(resolvedRelation) : [];
      };
      const refresh = whenSettled(update);
      const onChange = entity.onChange(resolvedRelation, refresh);
      const onRemove = entity.onRemove(resolvedRelation, refresh);
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
