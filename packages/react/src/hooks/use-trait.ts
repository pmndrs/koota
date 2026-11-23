import {
  $internal,
  $relationPair,
  isOrderedTrait,
  type Entity,
  type ExtractSchema,
  type OrderedTrait,
  type RelationPair,
  type Trait,
  type TraitRecord,
  type World,
} from '@koota/core';
import { useEntityValue } from '../utils/use-entity-value';
import { useWorld } from '../world/use-world';

export function readTrait(entity: Entity, trait: Trait | RelationPair) {
  return entity.has(trait) ? entity.get(trait) : undefined;
}

export function attachTrait<T extends Trait | RelationPair>(
  entity: Entity,
  trait: T,
  push: (value: TraitRecord<ExtractSchema<T>> | undefined) => void
) {
  const observer = entity[$internal].observeSettled(() => {
    push(entity.isAlive() ? entity.get(trait) : undefined);
  });
  const onChange = entity.onChange(trait, observer.invalidate);
  const onRemove = entity.onRemove(trait, observer.invalidate);
  return () => {
    observer.unsubscribe();
    onChange();
    onRemove();
  };
}

function readSnapshot(entity: Entity, trait: Trait | RelationPair) {
  return isOrderedTrait(trait)
    ? entity[$internal].getOrderedSnapshot(entity.get(trait))
    : readTrait(entity, trait);
}

function attachSnapshot(entity: Entity, trait: Trait | RelationPair, push: (value: unknown) => void) {
  if (!isOrderedTrait(trait)) return attachTrait(entity, trait, push);
  const { getOrderedSnapshot } = entity[$internal];
  let previous = getOrderedSnapshot(entity.get(trait));
  return attachTrait(entity, trait, (view) => {
    const next = getOrderedSnapshot(view);
    if (next !== previous) {
      previous = next;
      push(next);
    }
  });
}

export function useTrait<T extends Trait>(
  target: Entity | World | undefined | null,
  trait: T | RelationPair<T>
): (T extends OrderedTrait ? readonly Entity[] : TraitRecord<T>) | undefined;
export function useTrait(target: Entity | World | undefined | null, trait: Trait | RelationPair) {
  const world = useWorld();
  const sourceTrait = $relationPair in trait ? trait.relation[$internal].trait : trait;
  return useEntityValue(
    target,
    trait,
    readSnapshot,
    attachSnapshot,
    () => world[$internal].traitInstances[sourceTrait.id]
  );
}
