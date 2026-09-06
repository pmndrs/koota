import type { Entity, Relation, Trait, World } from '@koota/core';
import { useEntityValue } from '../utils/use-entity-value';

// Keep the empty result stable across renders when no entity is provided.
const noTargets: Entity[] = [];

function readTargets(entity: Entity, relation: Relation<Trait>) {
  return entity.targetsFor(relation);
}

function attachTargets(entity: Entity, relation: Relation<Trait>, push: (value: Entity[]) => void) {
  // onRemove fires before cleanup, and one removal can trigger another,
  // so removals filter the last pushed list rather than rereading.
  let targets = entity.targetsFor(relation);
  const update = () => push((targets = entity.targetsFor(relation)));
  const onAdd = entity.onAdd(relation, update);
  const onChange = entity.onChange(relation, update);
  const onRemove = entity.onRemove(relation, (_, removed) => {
    push((targets = targets.filter((t) => t !== removed)));
  });

  return () => {
    onAdd();
    onChange();
    onRemove();
  };
}

export function useTargets<T extends Trait>(
  target: Entity | World | undefined | null,
  relation: Relation<T>
): Entity[] {
  return useEntityValue(target, relation as Relation<Trait>, readTargets, attachTargets) ?? noTargets;
}
