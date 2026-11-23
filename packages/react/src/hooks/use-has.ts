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
  return entity[$internal].observeHas(entity, trait, push);
}

export function useHas(target: Entity | World | undefined | null, trait: HasInput): boolean {
  return useEntityValue(target, trait, readHas, attachHas) ?? false;
}
