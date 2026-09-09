import {
  $internal,
  type AoSFactory,
  type Schema,
  type Trait,
  type TraitRecord,
  type TraitValue,
} from '../../kernel';
import type { Entity } from '../entity/types';
import type { Relation, RelationPair } from '../relation/types';

/** Traits and schema types are shared with the kernel. Hooks use public entity methods. */
export type {
  Trait,
  TagTrait,
  TraitInstance,
  TraitType,
  TraitValue,
  TraitRecord,
} from '../../kernel';

/** Synchronous trait behavior. Mutating value writes it back before observers run. */
export type TraitHooks<S extends Schema = any> = {
  onAdd?: (value: TraitRecord<S>, entity: Entity, target?: Entity) => void;
  onSet?: (value: TraitRecord<S>, entity: Entity, target?: Entity) => void;
  onRemove?: (value: TraitRecord<S>, entity: Entity, target?: Entity) => void;
};

export type TraitTuple<T extends Trait = Trait> = [
  T,
  T extends Trait<infer S> ? (S extends AoSFactory ? ReturnType<S> : Partial<TraitRecord<S>>) : never,
];

export type ConfigurableTrait<T extends Trait = Trait> = T | TraitTuple<T> | RelationPair<T>;

export type SetTraitCallback<T extends Trait | RelationPair> = (
  prev: TraitRecord<ExtractSchema<T>>
) => TraitValue<ExtractSchema<T>>;

// Type Utils

export type ExtractSchema<T extends Trait | Relation<Trait> | RelationPair> =
  T extends RelationPair<infer R>
    ? ExtractSchema<R>
    : T extends Relation<infer R>
      ? ExtractSchema<R>
      : T extends Trait<infer S>
        ? S
        : never;
export type ExtractStore<T extends Trait> = T extends { [$internal]: { createStore(): infer Store } }
  ? Store
  : never;
export type ExtractIsTag<T extends Trait> = T extends { [$internal]: { type: 'tag' } } ? true : false;

export type IsTag<T extends Trait> = ExtractIsTag<T>;

export type TraitOrRelation = Trait | Relation<Trait>;

/** Extracts the underlying Trait from a TraitOrRelation (Relations contain a Trait) */
export type ExtractTrait<T> = T extends Relation<infer TTrait> ? TTrait : T;

/** Maps a tuple of TraitOrRelation to their underlying Traits */
export type ExtractTraits<T extends TraitOrRelation[]> = {
  [K in keyof T]: ExtractTrait<T[K]>;
};
