import {
  whenSettled,
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

export function readTrait(world: World, entity: Entity, trait: Trait | RelationPair) {
  return world.has(entity, trait) ? world.get(entity, trait) : undefined;
}

export function attachTrait<T extends Trait | RelationPair>(
  world: World,
  entity: Entity,
  trait: T,
  push: (value: TraitRecord<ExtractSchema<T>> | undefined) => void
) {
  const observer = world[$internal].observeSettled(() => {
    push(world.isAlive(entity) ? world.get(entity, trait) : undefined);
  });
  const onChange = world.onChange(entity, trait, observer.invalidate);
  const onRemove = world.onRemove(entity, trait, observer.invalidate);
  return () => {
    onChange();
    onRemove();
  };
}

function readSnapshot(world: World, entity: Entity, trait: Trait | RelationPair) {
  return isOrderedTrait(trait)
    ? world[$internal].getOrderedSnapshot(world.get(entity, trait))
    : readTrait(world, entity, trait);
}

function attachSnapshot(
  world: World,
  entity: Entity,
  trait: Trait | RelationPair,
  push: (value: unknown) => void
) {
  if (!isOrderedTrait(trait)) return attachTrait(world, entity, trait, push);
  const { getOrderedSnapshot } = world[$internal];
  let previous = getOrderedSnapshot(world.get(entity, trait));
  return attachTrait(world, entity, trait, (view) => {
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
  return useEntityValue(target, trait, readSnapshot, attachSnapshot, getTraitVersion);
}

function getTraitVersion(world: World, _entity: Entity, trait: Trait | RelationPair) {
  const sourceTrait = $relationPair in trait ? trait.relation[$internal].trait : trait;
  return world[$internal].traitInstances[sourceTrait.id];
}
