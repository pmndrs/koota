import { $relationPair, type Entity, type RelationPair, type Trait, type World } from '@koota/core';
import { useEntityValue } from '../utils/use-entity-value';

function readHas(entity: Entity, trait: Trait | RelationPair) {
  return entity.has(trait);
}

function attachHas(entity: Entity, trait: Trait | RelationPair, push: (value: boolean) => void) {
  // onRemove fires before cleanup, so a wildcard still matches if another target remains.
  const pair = trait as RelationPair;
  const wildcardRelation = pair[$relationPair] && pair.target === '*' ? pair.relation : undefined;

  const onAdd = entity.onAdd(trait, () => push(true));
  const onRemove = entity.onRemove(trait, () => {
    push(wildcardRelation ? entity.targetsFor(wildcardRelation).length > 1 : false);
  });

  return () => {
    onAdd();
    onRemove();
  };
}

export function useHas(
  target: Entity | World | undefined | null,
  trait: Trait | RelationPair
): boolean {
  return useEntityValue(target, trait, readHas, attachHas) ?? false;
}
