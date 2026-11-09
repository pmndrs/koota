import { $internal, type Entity, type Relation, type Trait, type World } from '@koota/core';
import { useEntityValue } from '../utils/use-entity-value';

// Keep the empty result stable across renders when no entity is provided.
const noTargets: Entity[] = [];

function readTargets(world: World, entity: Entity, relation: Relation<Trait>) {
  return world.targetsFor(entity, relation);
}

function attachTargets(
  world: World,
  entity: Entity,
  relation: Relation<Trait>,
  push: (value: Entity[]) => void
) {
  const observer = world[$internal].observeSettled(() => {
    push(world.isAlive(entity) ? world.targetsFor(entity, relation) : []);
  });
  const onChange = world.onChange(entity, relation, observer.invalidate);
  const onRemove = world.onRemove(entity, relation, observer.invalidate);
  return () => {
    observer.unsubscribe();
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
