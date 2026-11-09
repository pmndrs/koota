import { $internal } from '../common';
import type { MachineContext, MachineInstance } from '../machine/types';
import type { Identifier, IdentifierIndex, IdentifierPair } from '../identifier/types';
import type { Entity } from '../entity/types';
import type { QueryInstance } from '../query/types';
import type { ConfigurablePair, Relation, RelationPair } from '../relation/types';
import type { AoSFactory, RequiredField, Schema, Store, StoreType } from '../storage';
import type { WorldContext } from '../world';
import type { Subscriptions } from './subscriptions';

// Backwards-compatible alias (the trait "type" is the storage layout).
export type TraitType = StoreType;

export type TraitValue<TSchema extends Schema> = TSchema extends AoSFactory
  ? ReturnType<TSchema>
  : Partial<TraitRecord<TSchema>>;

type IsAny<T> = 0 extends 1 & T ? true : false;

type RequiredKeys<TSchema extends Schema> = {
  [K in keyof TSchema]: TSchema[K] extends RequiredField ? K : never;
}[keyof TSchema];

/**
 * Whether add needs a value because the schema has a required field.
 * An untyped schema resolves to any so open Trait references accept and pass as either kind.
 */
export type RequiresInit<TSchema extends Schema> =
  IsAny<TSchema> extends true
    ? any
    : TSchema extends Record<string, never>
      ? false
      : TSchema extends RequiredField
        ? true
        : TSchema extends AoSFactory
          ? false
          : [RequiredKeys<TSchema>] extends [never]
            ? false
            : true;

/** The value a trait takes on add. Required fields must be present and the rest fall back to defaults. */
export type TraitInit<TSchema extends Schema> = TSchema extends AoSFactory
  ? ReturnType<TSchema>
  : RequiresInit<TSchema> extends true
    ? Partial<TraitRecord<TSchema>> & {
        [K in RequiredKeys<TSchema>]: TraitRecord<TSchema>[K & keyof TraitRecord<TSchema>];
      }
    : Partial<TraitRecord<TSchema>>;

type TraitInitArgs<TSchema extends Schema> =
  IsAny<TSchema> extends true
    ? any[]
    : RequiresInit<TSchema> extends true
      ? [params: TraitInit<TSchema>]
      : [params?: TraitInit<TSchema>];

/**
 * Accessors preserve the schema's paged store and maintain only trait-owned state.
 * The core owns membership, queries, revisions and events. Accessors must not re-enter it.
 */
export type TraitAccessors<S extends Schema = any> = {
  /**
   * Initialize while membership is absent. On failure, undo any partial writes or indexes.
   */
  add(ctx: WorldContext, index: number, store: Store<S>, value?: TraitValue<S>): void;
  /** Runs only for members. Commit the value and return whether this call changed it. */
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
  /** Drop stored references when a destroyed entity is evicted. */
  readonly clear: ((index: number, store: any) => void) | undefined;
  readonly type: StoreType;
  /** True when the schema has a required field, so add needs a value. */
  readonly required: RequiresInit<S>;
  /** True for a plain paged SoA trait with scalar fields, which iteration can read in place. */
  readonly cursor: boolean;
  registered: boolean;
  machine: MachineContext | undefined;
  relation: Relation<any> | null;
  /** Membership cleanup dispatch, separate from the storage layout. */
  kind: 'trait' | 'relation' | 'identifier' | 'machine';
  /** The trait tracks identifier presence. Keys live in the world-local identifier index. */
  identifier: Identifier | undefined;
};

export type Trait<TSchema extends Schema = any> = {
  /** Public read-only ID for fast array lookups */
  readonly id: number;
  /** Defaults for new members. Field names, storage kinds, and tuple lengths are fixed. */
  readonly schema: TSchema;
  /**
   * Create a record of the schema defaults, such as a scratch record for get to fill.
   * A required value has no default, so it has no record.
   */
  readonly record: TSchema extends RequiredField ? never : () => TraitRecordFromSchema<TSchema>;
  readonly [$internal]: TraitContext<TSchema>;
} & ((...params: TraitInitArgs<TSchema>) => [Trait<TSchema>, TraitInit<TSchema>]);

export type TagTrait = Trait<Record<string, never>> & { [$internal]: { type: 'tag' } };

export type TraitTuple<T extends Trait = Trait> = [
  T,
  T extends Trait<infer S extends Schema> ? TraitInit<S> : never,
];

/** A trait with a required field cannot be added bare. It is called with its value instead. */
export type ConfigurableTrait<T extends Trait = Trait> =
  | (T & { readonly [$internal]: { readonly required: false } })
  | TraitTuple<T>
  | ConfigurablePair<T>
  | IdentifierPair;

export type SetTraitCallback<T extends Trait | RelationPair> = (
  prev: TraitRecord<ExtractSchema<T>>
) => TraitValue<ExtractSchema<T>>;

// A tag has no data, so it has no record.
type TraitRecordFromSchema<T extends Schema> = T extends AoSFactory
  ? ReturnType<T>
  : T extends Record<string, never>
    ? undefined
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
  /** Required identifier keys narrow the static queries that read this relation. */
  relationQueryIdentifiers: Identifier[] | undefined;
  /** Relations whose targets lead to the anchored queries that read this trait. */
  anchorRelations: TraitInstance[];
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
  identifier: IdentifierIndex | undefined;
  machine: MachineInstance | undefined;
  relationSourcesByTarget?: Entity[][];
}

/** A type whose presence can be queried or observed through a trait. */
export type TraitInput = Trait | Relation<Trait> | Identifier;

/** Resolve a type to its backing trait. Identifiers carry no trait data. */
export type ExtractTrait<T> = T extends Identifier
  ? TagTrait
  : T extends Relation<infer TTrait>
    ? TTrait
    : T;

/** Maps modifier inputs to the traits they read. A relation gives its trait and a pair gives none. */
export type ExtractModifierTraits<T extends unknown[]> = T extends [infer First, ...infer Rest]
  ? First extends RelationPair
    ? ExtractModifierTraits<Rest>
    : [ExtractTrait<First>, ...ExtractModifierTraits<Rest>]
  : T extends []
    ? []
    : ExtractTrait<Exclude<T[number], RelationPair>>[];

/** Resolve a tuple of types to their backing traits. */
export type ExtractTraits<T extends TraitInput[]> = {
  [K in keyof T]: ExtractTrait<T[K]>;
};
