import type { Identifier, IdentifierKey, IdentifierPair } from '../identifier/types';
import type { Relation, RelationPair } from '../relation/types';
import type {
  ConfigurableTrait,
  ExtractSchema,
  SetTraitCallback,
  Trait,
  TraitOut,
  TraitRecord,
  TraitValue,
} from '../trait/types';

/**
 * Entity scoped lifecycle hooks. Same inputs and callbacks as the world hooks,
 * but only fire for this entity so the callback needs no identity check.
 */
type EntityHook = {
  <K extends IdentifierKey>(
    input: Identifier<K> | IdentifierPair<K>,
    callback: (entity: Entity, key: K) => void
  ): () => void;
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

/** Trait and relation reads require liveness. Read retained values through Removed query iteration. */
export type Entity = number & {
  add: (...traits: ConfigurableTrait[]) => void;
  /** Write the given values to traits the entity has and add the traits it lacks. */
  upsert: (...traits: ConfigurableTrait[]) => void;
  remove: (...traits: (Trait | RelationPair | Identifier | IdentifierPair)[]) => void;
  has: (trait: Trait | RelationPair | Identifier | IdentifierPair) => boolean;
  destroy: () => void;
  changed: (trait: Trait) => void;
  set: <T extends Trait | RelationPair>(
    trait: T,
    value: TraitValue<ExtractSchema<T>> | SetTraitCallback<T>,
    flagChanged?: boolean
  ) => void;
  get: {
    <T extends Trait | RelationPair>(trait: T): TraitRecord<ExtractSchema<T>> | undefined;
    /** Fills out in place and returns it, without allocating. */
    <T extends Trait | RelationPair, O extends TraitOut<T>>(trait: T, out: O): O | undefined;
  };
  targetFor: {
    <K extends IdentifierKey>(identifier: Identifier<K>): K | undefined;
    <T extends Trait>(relation: Relation<T>): Entity | undefined;
  };
  targetsFor: {
    <K extends IdentifierKey>(identifier: Identifier<K>): K[];
    <T extends Trait>(relation: Relation<T>): Entity[];
  };
  onAdd: EntityHook;
  onRemove: EntityHook;
  /** Reports future additions and writes. Removals use onRemove. */
  onChange: EntityHook;
  id: () => number;
  generation: () => number;
  isAlive: () => boolean;
};
