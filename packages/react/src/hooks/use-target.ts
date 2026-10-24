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
  // onRemove fires before cleanup, so removals mirror the core's swap-and-pop
  // on the last read targets to find the first target that remains.
  let targets = entity.targetsFor(relation);
  const update = () => push((targets = entity.targetsFor(relation))[0]);
  const onAdd = entity.onAdd(relation, update);
  const onChange = entity.onChange(relation, update);
  const onRemove = entity.onRemove(relation, (_, removed) => {
    const index = targets.indexOf(removed);
    if (index === -1) return;
    const last = targets.pop()!;
    if (index < targets.length) targets[index] = last;
    push(targets[0]);
  });

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
