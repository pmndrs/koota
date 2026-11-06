import {
  $internal as internal,
  type Entity,
  type Relation,
  type Trait,
  type World,
} from '@koota/core';
import { getTargetEntity } from '../utils/get-target-entity.js';
import { type MaybeGetter, resolve } from '../utils/resolve.js';

export function useTargets<T extends Trait>(
  target: () => Entity | World | undefined | null,
  relation: MaybeGetter<Relation<T>>
): { readonly current: Entity[] } {
  const initialEntity = getTargetEntity(target());
  let value = $state.raw<Entity[]>(initialEntity?.targetsFor(resolve(relation)) ?? []);

  $effect(() => {
    const entity = getTargetEntity(target());

    if (entity === undefined) {
      value = [];
      return;
    }

    const resolvedRelation = resolve(relation);
    const update = () => {
      value = entity.isAlive() ? entity.targetsFor(resolvedRelation) : [];
    };
    const observer = entity[internal].observeSettled(update);
    const onChange = entity.onChange(resolvedRelation, observer.invalidate);
    const onRemove = entity.onRemove(resolvedRelation, observer.invalidate);
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
