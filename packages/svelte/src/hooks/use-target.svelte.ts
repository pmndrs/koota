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
    const t = target();

    if (!t) {
      value = undefined;
      return;
    }

    const resolvedRelation = resolve(relation);
    const entity = getTargetEntity(t)!;
    let targets: Entity[];

    const update = () => {
      targets = entity.targetsFor(resolvedRelation);
      value = targets[0];
    };

    const onAddUnsub = entity.onAdd(resolvedRelation, update);

    const onRemoveUnsub = entity.onRemove(resolvedRelation, (_, removedTarget) => {
      // onRemove fires before core removes the target, so mirror its swap-and-pop.
      const index = targets.indexOf(removedTarget);
      if (index === -1) return;

      const lastTarget = targets.pop()!;
      if (index < targets.length) targets[index] = lastTarget;
      value = targets[0];
    });

    const onChangeUnsub = entity.onChange(resolvedRelation, update);

    update();

    return () => {
      onAddUnsub();
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
