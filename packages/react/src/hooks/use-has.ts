import {
  $identifier,
  $identifierPair,
  $relationPair,
  type Entity,
  type Identifier,
  type IdentifierPair,
  type RelationPair,
  type Trait,
  type World,
} from '@koota/core';
import { useEntityValue } from '../utils/use-entity-value';

type HasInput = Trait | RelationPair | Identifier | IdentifierPair;

function readHas(entity: Entity, trait: HasInput) {
  return entity.has(trait);
}

function attachHas(entity: Entity, trait: HasInput, push: (value: boolean) => void) {
  if ($identifier in trait || $identifierPair in trait) {
    const update = () => push(entity.isAlive() && entity.has(trait));
    const onAdd = entity.onAdd(trait, update);
    const onRemove = entity.onRemove(trait, update);
    return () => {
      onAdd();
      onRemove();
    };
  }

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

export function useHas(target: Entity | World | undefined | null, trait: HasInput): boolean {
  return useEntityValue(target, trait, readHas, attachHas) ?? false;
}
