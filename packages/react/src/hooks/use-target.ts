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

  if ($identifier in relation) {
    const update = () => push(entity.isAlive() ? readTarget(entity, relation) : undefined);
    const onChange = entity.onChange(trait, update);
    // Identifier removal observes the committed mapping, including a replacement key.
    const onRemove = entity.onRemove(trait, update);

    return () => {
      onChange();
      onRemove();
    };
  }

  // Relation removal fires before cleanup, so it mirrors the core's swap-and-pop
  // on the last read targets to find the first target that remains.
  let targets = entity.targetsFor(relation);
  const onChange = entity.onChange(relation, () => {
    targets = entity.isAlive() ? entity.targetsFor(relation) : [];
    push(targets[0]);
  });
  const onRemove = entity.onRemove(relation, (_, removed) => {
    const index = targets.indexOf(removed);
    if (index === -1) return;
    const last = targets.pop()!;
    if (index < targets.length) targets[index] = last;
    push(targets[0]);
  });

  return () => {
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
