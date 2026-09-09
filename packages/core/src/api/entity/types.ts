import type { Relation, RelationPair } from '../relation/types';
import type {
  ConfigurableTrait,
  ExtractSchema,
  SetTraitCallback,
  Trait,
  TraitRecord,
  TraitValue,
} from '../trait/types';

/**
 * Entity scoped lifecycle hooks. Same inputs and callbacks as the world hooks,
 * but only fire for this entity so the callback needs no identity check.
 */
type EntityHook = {
  <T extends Trait>(trait: T, callback: (entity: Entity) => void): () => void;
  <T extends Trait>(
    relation: Relation<T>,
    callback: (entity: Entity, target: Entity) => void
  ): () => void;
  <T extends Trait>(
    pair: RelationPair<T>,
    callback: (entity: Entity, target: Entity) => void
  ): () => void;
  (
    input: Trait | Relation<Trait> | RelationPair,
    callback: (entity: Entity, target?: Entity) => void
  ): () => void;
};

export type Entity = number & {
  add: (...traits: ConfigurableTrait[]) => void;
  remove: (...traits: (Trait | RelationPair)[]) => void;
  has: (trait: Trait | RelationPair) => boolean;
  destroy: () => void;
  changed: (trait: Trait) => void;
  set: <T extends Trait | RelationPair>(
    trait: T,
    value: TraitValue<ExtractSchema<T>> | SetTraitCallback<T>,
    flagChanged?: boolean
  ) => void;
  get: <T extends Trait | RelationPair>(trait: T) => TraitRecord<ExtractSchema<T>> | undefined;
  targetFor: <T extends Trait>(relation: Relation<T>) => Entity | undefined;
  targetsFor: <T extends Trait>(relation: Relation<T>) => Entity[];
  onAdd: EntityHook;
  onRemove: EntityHook;
  onChange: EntityHook;
  id: () => number;
  generation: () => number;
  isAlive: () => boolean;
};
