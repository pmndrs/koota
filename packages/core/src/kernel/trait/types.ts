import type { KernelContext } from '../context';
import { $internal } from '../common';
import type { Entity } from '../entity/types';
import type { QueryInstance } from '../query/types';
import type { Relation, RelationPair } from '../relation/types';
import type { AoSFactory, Schema, Store, StoreType } from '../storage';
import type { Subscriptions } from './subscriptions';

// Backwards-compatible alias (the trait "type" is the storage layout).
export type TraitType = StoreType;

export type TraitValue<TSchema extends Schema> = TSchema extends AoSFactory
  ? ReturnType<TSchema>
  : Partial<TraitRecord<TSchema>>;

/** Synchronous trait behavior. Mutating value writes it back before observers run. */
export type TraitHooks<S extends Schema = any> = {
  onAdd?(value: TraitRecord<S>, entity: Entity, target?: Entity): void;
  onSet?(value: TraitRecord<S>, entity: Entity, target?: Entity): void;
  onRemove?(value: TraitRecord<S>, entity: Entity, target?: Entity): void;
};

export type Trait<TSchema extends Schema = any> = {
  (params?: TraitValue<TSchema>): [Trait<TSchema>, TraitValue<TSchema>];
  [$internal]: {
    set: (index: number, store: any, value: TraitValue<TSchema>) => void;
    fastSet: (index: number, store: any, value: TraitValue<TSchema>) => boolean;
    fastSetWithChangeDetection: (index: number, store: any, value: TraitValue<TSchema>) => boolean;
    get: (index: number, store: any) => TraitRecord<TSchema>;
    readonly id: number;
    readonly schema: TSchema;
    createStore: () => Store<TSchema>;
    /** Reference to parent relation if this trait is owned by a relation */
    relation: Relation<any> | null;
    type: StoreType;
    hooks?: Readonly<TraitHooks<TSchema>>;
    initialize?: (ctx: KernelContext, entity: Entity) => any;
    onRegister?: (ctx: KernelContext) => void;
  };
};

export type TagTrait = Trait<Record<string, never>> & { [$internal]: { type: 'tag' } };

export type TraitTuple<T extends Trait = Trait> = [
  T,
  T extends Trait<infer S> ? (S extends AoSFactory ? ReturnType<S> : Partial<TraitRecord<S>>) : never,
];

export type ConfigurableTrait<T extends Trait = Trait> = T | TraitTuple<T> | RelationPair<T>;

export type SetTraitCallback<T extends Trait | RelationPair> = (
  prev: TraitRecord<ExtractSchema<T>>
) => TraitValue<ExtractSchema<T>>;

type TraitRecordFromSchema<T extends Schema> = T extends AoSFactory
  ? ReturnType<T>
  : {
      [P in keyof T]: T[P] extends (...args: never[]) => unknown ? ReturnType<T[P]> : T[P];
    };

/**
 * The record of a trait.
 * For SoA it is a snapshot of the state for a single entity.
 * For AoS it is the state instance for a single entity.
 */
export type TraitRecord<T extends Trait | Schema> = T extends Trait
  ? TraitRecordFromSchema<T[typeof $internal]['schema']>
  : TraitRecordFromSchema<T>;

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

export interface TraitInstance<T extends Trait = Trait, S extends Schema = ExtractSchema<T>> {
  /** Revision for possible writes and membership changes, even without change events. */
  version: number;
  generationId: number;
  bitflag: number;
  trait: Trait;
  store: Store<S>;
  /** Non-tracking queries that include this trait */
  queries: Set<QueryInstance>;
  /** Tracking queries (Added/Removed/Changed) that include this trait */
  trackingQueries: Set<QueryInstance>;
  notQueries: Set<QueryInstance>;
  /** Queries that filter by this relation (only for relation traits) */
  relationQueries: Set<QueryInstance>;
  schema: S;
  changeSubscriptions: Subscriptions;
  addSubscriptions: Subscriptions;
  removeSubscriptions: Subscriptions;
  /**
   * Paged relation targets.
   * For exclusive: relationTargets[pageId][offset] = targetId (number)
   * For non-exclusive: relationTargets[pageId][offset] = [targetId1, targetId2, ...] (number[])
   */
  relationTargets?: any[][];
  relationSourcesByTarget?: Entity[][];
}

export type TraitOrRelation = Trait | Relation<Trait>;

/** Extracts the underlying Trait from a TraitOrRelation (Relations contain a Trait) */
export type ExtractTrait<T> = T extends Relation<infer TTrait> ? TTrait : T;

/** Maps a tuple of TraitOrRelation to their underlying Traits */
export type ExtractTraits<T extends TraitOrRelation[]> = {
  [K in keyof T]: ExtractTrait<T[K]>;
};
