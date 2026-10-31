import { $internal } from '../common';
import type { Entity } from '../entity/types';
import type { QueryInstance } from '../query/types';
import type { Relation, RelationPair } from '../relation/types';
import type { AoSFactory, Schema, Store, StoreType } from '../storage';
import type { WorldContext } from '../world';
import type { Subscriptions } from './subscriptions';

// Backwards-compatible alias (the trait "type" is the storage layout).
export type TraitType = StoreType;

export type TraitValue<TSchema extends Schema> = TSchema extends AoSFactory
  ? ReturnType<TSchema>
  : Partial<TraitRecord<TSchema>>;

/**
 * Accessors preserve the schema's paged store and maintain only trait-owned state.
 * The core owns membership, queries, revisions and events. Accessors must not re-enter it.
 */
export type TraitAccessors<S extends Schema = any> = {
  /** Check a candidate value before any storage or membership changes. */
  validate?(ctx: WorldContext, index: number, value: TraitValue<S> | undefined): boolean | void;
  /**
   * Initialize while membership is absent. On failure, undo any partial writes or indexes.
   */
  add(ctx: WorldContext, index: number, store: Store<S>, value?: TraitValue<S>): void;
  /** Runs only for members. Commit validated state and return whether this call changed it. */
  set(ctx: WorldContext, index: number, store: Store<S>, value: TraitValue<S>): boolean;
  /** Runs only for members. Read without side effects. SoA returns a snapshot with copied tuples and AoS returns the stored value. */
  get(ctx: WorldContext, index: number, store: Store<S>): TraitRecord<S>;
  /** Runs only for members. Read like get, but fill a caller-owned record and return it without allocating. */
  getInto(ctx: WorldContext, index: number, store: Store<S>, out: TraitRecord<S>): TraitRecord<S>;
  /** Release auxiliary state before membership is removed. Cleanup must not throw. */
  remove(ctx: WorldContext, index: number, store: Store<S>): void;
};

export type TraitContext<S extends Schema = any> = Readonly<TraitAccessors<S>> & {
  readonly id: number;
  readonly createStore: () => Store<S>;
  readonly type: StoreType;
  relation: Relation<any> | null;
};

export type Trait<TSchema extends Schema = any> = {
  /** Public read-only ID for fast array lookups */
  readonly id: number;
  readonly schema: TSchema;
  readonly [$internal]: TraitContext<TSchema>;
} & ((params?: TraitValue<TSchema>) => [Trait<TSchema>, TraitValue<TSchema>]);

export type TagTrait = Trait<Record<string, never>> & { [$internal]: { type: 'tag' } };

export type TraitTuple<T extends Trait = Trait> = [
  T,
  T extends Trait<infer S extends Schema>
    ? S extends AoSFactory
      ? ReturnType<S>
      : Partial<TraitRecord<S>>
    : never,
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
  ? TraitRecordFromSchema<T['schema']>
  : TraitRecordFromSchema<T>;

/**
 * A caller-owned record that get fills in place, such as one returned by an earlier get.
 * AoS traits return their stored value, so they take none.
 */
export type TraitOut<T extends Trait | RelationPair> =
  ExtractSchema<T> extends AoSFactory ? never : TraitRecord<ExtractSchema<T>>;

// Type Utils

export type ExtractSchema<T extends Trait | Relation<Trait> | RelationPair> =
  T extends RelationPair<infer R>
    ? ExtractSchema<R>
    : T extends Relation<infer R>
      ? ExtractSchema<R>
      : T extends Trait<infer S extends Schema>
        ? S
        : never;
export type ExtractStore<T extends Trait> = T extends {
  [$internal]: { createStore(): infer Store };
}
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
  queries: QueryInstance[];
  /** Tracking queries (Added/Removed/Changed) that include this trait */
  trackingQueries: QueryInstance[];
  /** Queries that filter by this relation (only for relation traits) */
  relationQueries: QueryInstance[];
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
