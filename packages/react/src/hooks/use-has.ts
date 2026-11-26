import {
  whenSettled,
  type Entity,
  type Identifier,
  type IdentifierPair,
  type RelationPair,
  type Trait,
  type World,
} from '@koota/core';
import { useEntityValue } from '../utils/use-entity-value';
import { useWorld } from '../world/use-world';

type HasInput = Trait | RelationPair | Identifier | IdentifierPair;

function readHas(entity: Entity, trait: HasInput) {
  return entity.has(trait);
}

function attachHas(entity: Entity, trait: HasInput, push: (value: boolean) => void) {
  const refresh = whenSettled(() => push(entity.isAlive() && entity.has(trait)));
  // The hook overloads take no union. Core resolves every input and filters exact terms by key.
  const onAdd = entity.onAdd(trait as Trait, refresh);
  const onRemove = entity.onRemove(trait as Trait, refresh);
  return () => {
    onAdd();
    onRemove();
  };
}

export function useHas(target: Entity | World | undefined | null, trait: HasInput): boolean {
  useWorld();
  return useEntityValue(target, trait, readHas, attachHas) ?? false;
}
