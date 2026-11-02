import {
  $internal,
  $relationPair,
  isOrderedTrait,
  resolveWorld,
  type Entity,
  type ExtractSchema,
  type MutableOrderedView,
  type OrderedTrait,
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
  return resolveWorld(entity)?.traitInstances[trait.id];
}

export function attachTrait<T extends Trait | RelationPair>(
  entity: Entity,
  trait: T,
  push: (value: TraitRecord<ExtractSchema<T>> | undefined) => void
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

const orderedSnapshots = new WeakMap<MutableOrderedView, readonly Entity[]>();

function orderedSnapshot(view: MutableOrderedView | undefined) {
  if (!view) return undefined;
  const previous = orderedSnapshots.get(view);
  if (previous?.length === view.length && previous.every((entity, i) => view.at(i) === entity)) {
    return previous;
  }
  const snapshot = Object.freeze(view.toArray());
  orderedSnapshots.set(view, snapshot);
  return snapshot;
}

function readSnapshot(entity: Entity, trait: Trait | RelationPair) {
  return isOrderedTrait(trait) ? orderedSnapshot(entity.get(trait)) : readTrait(entity, trait);
}

function attachSnapshot(entity: Entity, trait: Trait | RelationPair, push: (value: unknown) => void) {
  if (!isOrderedTrait(trait)) return attachTrait(entity, trait, push);
  let previous = orderedSnapshot(entity.get(trait));
  return attachTrait(entity, trait, (view) => {
    const next = orderedSnapshot(view);
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
  return useEntityValue(target, trait, readSnapshot, attachSnapshot, getTraitVersionSource);
}
