import type { Entity, RelationPair, Trait, TraitRecord, World } from '@koota/core';
import { useEntityValue } from '../utils/use-entity-value';

export function readTrait(entity: Entity, trait: Trait | RelationPair) {
  return entity.has(trait) ? entity.get(trait) : undefined;
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
  return useEntityValue(target, trait, readTrait, attachTrait) as TraitRecord<T> | undefined;
}
