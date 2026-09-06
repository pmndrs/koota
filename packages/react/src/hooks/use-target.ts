import type { Entity, Relation, Trait, World } from '@koota/core';
import { useEntityValue } from '../utils/use-entity-value';

function readTarget(entity: Entity, relation: Relation<Trait>) {
  return entity.targetFor(relation);
}

function attachTarget(
  entity: Entity,
  relation: Relation<Trait>,
  push: (value: Entity | undefined) => void
) {
  const update = () => push(entity.targetFor(relation));
  const onAdd = entity.onAdd(relation, update);
  const onChange = entity.onChange(relation, update);
  const onRemove = entity.onRemove(relation, () => push(undefined));

  return () => {
    onAdd();
    onChange();
    onRemove();
  };
}

export function useTarget<T extends Trait>(
  target: Entity | World | undefined | null,
  relation: Relation<T>
): Entity | undefined {
  return useEntityValue(target, relation as Relation<Trait>, readTarget, attachTarget);
}
