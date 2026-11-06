import { observeSettled } from '../utils/observe-settled';
import {
  $identifier,
  $internal,
  type Entity,
  type Identifier,
  type IdentifierKey,
  type Relation,
  type Trait,
  type World,
} from '@koota/core';
import { useEntityValue } from '../utils/use-entity-value';

function readTarget(
  entity: Entity,
  relation: Relation<Trait> | Identifier
): IdentifierKey | undefined {
  if ($identifier in relation) return entity.targetFor(relation);
  return entity.targetFor(relation);
}

function attachTarget(
  entity: Entity,
  relation: Relation<Trait> | Identifier,
  push: (value: IdentifierKey | undefined) => void
) {
  const observer = observeSettled(entity[$internal], () => {
    push(entity.isAlive() ? readTarget(entity, relation) : undefined);
  });
  const trait = relation[$internal].trait;
  const onChange = entity.onChange(trait, observer.invalidate);
  const onRemove = entity.onRemove(trait, observer.invalidate);
  return () => {
    observer.unsubscribe();
    onChange();
    onRemove();
  };
}

export function useTarget<K extends IdentifierKey>(
  target: Entity | World | undefined | null,
  identifier: Identifier<K>
): K | undefined;
export function useTarget<T extends Trait>(
  target: Entity | World | undefined | null,
  relation: Relation<T>
): Entity | undefined;
export function useTarget(
  target: Entity | World | undefined | null,
  relation: Relation<Trait> | Identifier
) {
  return useEntityValue(target, relation, readTarget, attachTarget);
}
