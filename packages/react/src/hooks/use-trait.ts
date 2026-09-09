import {
  $internal,
  $relationPair,
  universe,
  type Entity,
  type RelationPair,
  type Trait,
  type TraitRecord,
  type World,
} from '@koota/core';
import { useEntityValue } from '../utils/use-entity-value';

export function readTrait(entity: Entity, trait: Trait | RelationPair) {
  return entity.has(trait) ? entity.get(trait) : undefined;
}

function getTraitVersionSource(entity: Entity, trait: Trait | RelationPair) {
  if ($relationPair in trait) trait = trait.relation[$internal].trait;
  return universe.pageOwners[entity.id() >>> 10]?.traitInstances[trait[$internal].id];
}

export function attachTrait(
  entity: Entity,
  trait: Trait | RelationPair,
  push: (value: unknown) => void
) {
  const update = () => push(entity.get(trait));
  const onChange = entity.onChange(trait, update);
  const onAdd = entity.onAdd(trait, update);
  const onRemove = entity.onRemove(trait, () => push(undefined));

  return () => {
    onChange();
    onAdd();
    onRemove();
  };
}

export function useTrait<T extends Trait>(
  target: Entity | World | undefined | null,
  trait: T | RelationPair<T>
): TraitRecord<T> | undefined {
  return useEntityValue(target, trait, readTrait, attachTrait, getTraitVersionSource) as
    TraitRecord<T> | undefined;
}
