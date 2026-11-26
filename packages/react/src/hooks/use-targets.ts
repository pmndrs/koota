import { whenSettled, type Entity, type Relation, type Trait, type World } from '@koota/core';
import { useEntityValue } from '../utils/use-entity-value';

// Keep the empty result stable across renders when no entity is provided.
const noTargets: Entity[] = [];

function readTargets(world: World, entity: Entity, relation: Relation<Trait>, previous?: Entity[]) {
  const targets = world.targetsFor(entity, relation);
  if (previous?.length === targets.length && targets.every((target, i) => target === previous[i])) {
    return previous;
  }
  return targets;
}

function attachTargets(
  world: World,
  entity: Entity,
  relation: Relation<Trait>,
  push: (value: Entity[]) => void
) {
  const refresh = whenSettled(() => {
    push(world.has(entity) ? world.targetsFor(entity, relation) : []);
  });
  const onChange = world.onChange(entity, relation, refresh);
  const onRemove = world.onRemove(entity, relation, refresh);
  return () => {
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
