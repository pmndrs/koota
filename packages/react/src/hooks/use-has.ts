import { $internal, $identifier, $identifierPair } from '@koota/core';
import { observeSettled } from '../utils/observe-settled';
import {
  type Entity,
  type Identifier,
  type IdentifierPair,
  type RelationPair,
  type Trait,
  type World,
} from '@koota/core';
import { useEntityValue } from '../utils/use-entity-value';

type HasInput = Trait | RelationPair | Identifier | IdentifierPair;

function readHas(entity: Entity, trait: HasInput) {
  return entity.has(trait);
}

function attachHas(entity: Entity, trait: HasInput, push: (value: boolean) => void) {
  const observer = observeSettled(entity[$internal], () =>
    push(entity.isAlive() && entity.has(trait))
  );
  const source =
    $identifier in trait
      ? trait[$internal].trait
      : $identifierPair in trait
        ? trait.identifier[$internal].trait
        : trait;
  const onAdd = entity.onAdd(source, observer.invalidate);
  const onRemove = entity.onRemove(source, observer.invalidate);
  return () => {
    observer.unsubscribe();
    onAdd();
    onRemove();
  };
}

export function useHas(target: Entity | World | undefined | null, trait: HasInput): boolean {
  return useEntityValue(target, trait, readHas, attachHas) ?? false;
}
