import { type Entity, type Relation, type Trait, type World } from '@koota/core';
import { getTargetEntity } from '../utils/get-target-entity.js';
import { isWorld } from '../utils/is-world.js';
import { type MaybeGetter, resolve } from '../utils/resolve.js';
import { useWorld } from '../world/world-context.js';

export function useTarget<T extends Trait>(
  target: () => Entity | World | undefined | null,
  relation: MaybeGetter<Relation<T>>
): { readonly current: Entity | undefined } {
  const contextWorld = useWorld();
  const initialEntity = getTargetEntity(target());
  let value = $state.raw<Entity | undefined>(initialEntity?.targetFor(resolve(relation)));

  $effect(() => {
    const t = target();

    if (!t) {
      value = undefined;
      return;
    }

    const resolvedRelation = resolve(relation);
    const world = isWorld(t) ? t : contextWorld;
    let entity: Entity;
    let targets: Entity[];

    const update = () => {
      targets = entity.targetsFor(resolvedRelation);
      value = targets[0];
    };

    /**
     * Subscribe before reading worldEntity: world.onAdd triggers lazy
     * registration so worldEntity is guaranteed to exist after this.
     */
    const onAddUnsub = world.onAdd(resolvedRelation, (e) => {
      if (e === entity) update();
    });

    const onRemoveUnsub = world.onRemove(resolvedRelation, (e, removedTarget) => {
      if (e !== entity) return;

      // onRemove fires before core removes the target, so mirror its swap-and-pop.
      const index = targets.indexOf(removedTarget);
      if (index === -1) return;

      const lastTarget = targets.pop()!;
      if (index < targets.length) targets[index] = lastTarget;
      value = targets[0];
    });

    const onChangeUnsub = world.onChange(resolvedRelation, (e) => {
      if (e === entity) update();
    });

    entity = getTargetEntity(t)!;
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
