import { $internal, type Entity, type Relation, type Trait, type World } from '@koota/core';
import { useEntityValue } from '../utils/use-entity-value';

// Keep the empty result stable across renders when no entity is provided.
const noTargets: Entity[] = [];

function readTargets(entity: Entity, relation: Relation<Trait>) {
  return entity.targetsFor(relation);
}

function attachTargets(entity: Entity, relation: Relation<Trait>, push: (value: Entity[]) => void) {
  const observer = entity[$internal].observeSettled(() => {
    push(entity.isAlive() ? entity.targetsFor(relation) : []);
  });
  const onChange = entity.onChange(relation, observer.invalidate);
  const onRemove = entity.onRemove(relation, observer.invalidate);
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
