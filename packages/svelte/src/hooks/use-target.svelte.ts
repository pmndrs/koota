import { type Entity, type Relation, type Trait, type World } from '@koota/core';
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
    let active = true;
    let pending = false;

    const update = () => {
      if (active) value = entity.isAlive() ? entity.targetFor(resolvedRelation) : undefined;
    };

    const onRemoveUnsub = entity.onRemove(resolvedRelation, () => {
      // Relation cleanup follows onRemove, including mutations made by other subscribers.
      if (pending) return;
      pending = true;
      queueMicrotask(() => {
        pending = false;
        update();
      });
    });

    const onChangeUnsub = entity.onChange(resolvedRelation, update);

    update();

    return () => {
      active = false;
      onRemoveUnsub();
      onChangeUnsub();
    };
  });

  return {
    get current() {
      return value;
    },
  };
}
