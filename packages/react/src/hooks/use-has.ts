import {
  $internal,
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
  const observer = entity[$internal].observeSettled(() =>
    push(entity.isAlive() && entity.has(trait))
  );
  // The hook overloads take no union. Core resolves every input and filters exact terms by key.
  const onAdd = entity.onAdd(trait as Trait, observer.invalidate);
  const onRemove = entity.onRemove(trait as Trait, observer.invalidate);
  return () => {
    observer.unsubscribe();
    onAdd();
    onRemove();
  };
}

export function useHas(target: Entity | World | undefined | null, trait: HasInput): boolean {
  return useEntityValue(target, trait, readHas, attachHas) ?? false;
}
