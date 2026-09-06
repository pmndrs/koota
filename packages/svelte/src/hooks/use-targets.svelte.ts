import { type Entity, type Relation, type Trait, type World } from '@koota/core';
import { getTargetEntity } from '../utils/get-target-entity.js';
import { type MaybeGetter, resolve } from '../utils/resolve.js';

export function useTargets<T extends Trait>(
  target: () => Entity | World | undefined | null,
  relation: MaybeGetter<Relation<T>>
): { readonly current: Entity[] } {
  const initialEntity = getTargetEntity(target());
  let value = $state.raw<Entity[]>(initialEntity?.targetsFor(resolve(relation)) ?? []);

  $effect(() => {
    const t = target();

    if (!t) {
      value = [];
      return;
    }

    const resolvedRelation = resolve(relation);
    const entity = getTargetEntity(t)!;

    // Callbacks run inside whatever effect mutated the world, so they read
    // this plain list instead of the signal.
    let targets: Entity[] = [];

    const update = (next: Entity[]) => {
      targets = next;
      value = next;
    };

    const onAddUnsub = entity.onAdd(resolvedRelation, () => {
      update(entity.targetsFor(resolvedRelation));
    });

    // onRemove fires before data is removed, so filter out the target
    const onRemoveUnsub = entity.onRemove(resolvedRelation, (_, removedTarget) => {
      update(targets.filter((p) => p !== removedTarget));
    });

    const onChangeUnsub = entity.onChange(resolvedRelation, () => {
      update(entity.targetsFor(resolvedRelation));
    });

    update(entity.targetsFor(resolvedRelation));

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
