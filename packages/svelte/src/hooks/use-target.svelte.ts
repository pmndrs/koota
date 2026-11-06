import {
  $internal as internal,
  type Entity,
  type Relation,
  type Trait,
  type World,
} from '@koota/core';
import { getTargetEntity } from '../utils/get-target-entity.js';
import { type MaybeGetter, resolve } from '../utils/resolve.js';

export function useTarget<T extends Trait>(
  target: () => Entity | World | undefined | null,
  relation: MaybeGetter<Relation<T>>
): { readonly current: Entity | undefined } {
  const initialEntity = getTargetEntity(target());
  let value = $state.raw<Entity | undefined>(initialEntity?.targetFor(resolve(relation)));

  $effect(() => {
    const entity = getTargetEntity(target());

    if (entity === undefined) {
      value = undefined;
      return;
    }

    const resolvedRelation = resolve(relation);
    const update = () => {
      value = entity.isAlive() ? entity.targetFor(resolvedRelation) : undefined;
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
