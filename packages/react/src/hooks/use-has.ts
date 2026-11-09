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

function readHas(world: World, entity: Entity, trait: HasInput) {
  return world.has(entity, trait);
}

function attachHas(world: World, entity: Entity, trait: HasInput, push: (value: boolean) => void) {
  const observer = world[$internal].observeSettled(() =>
    push(world.isAlive(entity) && world.has(entity, trait))
  );
  // The hook overloads take no union. Core resolves every input and filters exact terms by key.
  const onAdd = world.onAdd(entity, trait as Trait, observer.invalidate);
  const onRemove = world.onRemove(entity, trait as Trait, observer.invalidate);
  return () => {
    observer.unsubscribe();
    onAdd();
    onRemove();
  };
}

export function useHas(target: Entity | World | undefined | null, trait: HasInput): boolean {
  return useEntityValue(target, trait, readHas, attachHas) ?? false;
}
