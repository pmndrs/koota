import { type Entity, type Relation, type Trait, type World } from '@koota/core';
import { getTargetEntity } from '../utils/get-target-entity.js';
import { isWorld } from '../utils/is-world.js';
import { type MaybeGetter, resolve } from '../utils/resolve.js';
import { useWorld } from '../world/world-context.js';

export function useTargets<T extends Trait>(
  target: () => Entity | World | undefined | null,
  relation: MaybeGetter<Relation<T>>
): { readonly current: Entity[] } {
  const contextWorld = useWorld();
  const initialEntity = getTargetEntity(target());
  let value = $state.raw<Entity[]>(initialEntity?.targetsFor(resolve(relation)) ?? []);

  $effect(() => {
    const t = target();

    if (!t) {
      value = [];
      return;
    }

    const resolvedRelation = resolve(relation);
    const world = isWorld(t) ? t : contextWorld;
    let entity: Entity;

    // Callbacks run inside whatever effect mutated the world, so they read
    // this plain list instead of the signal.
    let targets: Entity[] = [];

    const update = (next: Entity[]) => {
      targets = next;
      value = next;
    };

    /**
     * Subscribe before reading worldEntity: world.onAdd triggers lazy
     * registration so worldEntity is guaranteed to exist after this.
     */
    const onAddUnsub = world.onAdd(resolvedRelation, (e) => {
      if (e === entity) update(entity.targetsFor(resolvedRelation));
    });

    // onRemove fires before data is removed, so filter out the target
    const onRemoveUnsub = world.onRemove(resolvedRelation, (e, removedTarget) => {
      if (e === entity) update(targets.filter((p) => p !== removedTarget));
    });

    const onChangeUnsub = world.onChange(resolvedRelation, (e) => {
      if (e === entity) update(entity.targetsFor(resolvedRelation));
    });

    entity = getTargetEntity(t)!;
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
