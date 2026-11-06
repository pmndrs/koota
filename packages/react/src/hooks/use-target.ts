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
  const trait = relation[$internal].trait;
  let active = true;
  let pending = false;
  const update = () => {
    if (active) push(entity.isAlive() ? readTarget(entity, relation) : undefined);
  };
  const onChange = entity.onChange(trait, update);
  const onRemove = entity.onRemove(trait, () => {
    // Identifier removal already observes the committed mapping.
    if ($identifier in relation) {
      update();
      return;
    }
    // Relation cleanup follows onRemove, including mutations made by other subscribers.
    if (pending) return;
    pending = true;
    queueMicrotask(() => {
      pending = false;
      update();
    });
  });

  return () => {
    active = false;
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
