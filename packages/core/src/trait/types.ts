import { $internal } from '../common';
import type { Entity } from '../entity/types';
import type { QueryInstance } from '../query/types';
import type { Relation, RelationPair } from '../relation/types';
import type { AoSFactory, Schema, Store, StoreType } from '../storage';

// Backwards-compatible alias (the trait "type" is the storage layout).
export type TraitType = StoreType;

export type TraitValue<TSchema extends Schema> = TSchema extends AoSFactory
    ? ReturnType<TSchema>
    : Partial<TraitRecord<TSchema>>;

/**
 * A trait definition.
 *
 * @typeParam TSchema - The normalized schema type (what entity.get() returns)
 * @typeParam TStoreSchema - The schema type preserving TypedField for Store typing
 */
export type Trait<TSchema extends Schema = any, TStoreSchema extends Schema = TSchema> = {
    /** Public read-only ID for fast array lookups */
    readonly id: number;
    readonly schema: TSchema;
    [$internal]: {
        set: (index: number, store: any, value: TraitValue<TSchema>) => void;
        fastSet: (index: number, store: any, value: TraitValue<TSchema>) => boolean;
        fastSetWithChangeDetection: (
            index: number,
            store: any,
            value: TraitValue<TSchema>
        ) => boolean;
        get: (index: number, store: any) => TraitRecord<TSchema>;
        id: number;
        createStore: () => Store<TStoreSchema>;
        /** Reference to parent relation if this trait is owned by a relation */
        relation: Relation<any> | null;
        type: StoreType;
    };
} & ((params?: TraitValue<TSchema>) => [Trait<TSchema, TStoreSchema>, TraitValue<TSchema>]);

export type TagTrait = Trait<Record<string, never>> & { [$internal]: { type: 'tag' } };

export type TraitTuple<T extends Trait = Trait> = [
    T,
    T extends Trait<infer S>
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

// Type Utils

/** Extracts the normalized schema (TSchema) from a Trait - used for entity.get() return types */
export type ExtractSchema<T extends Trait | Relation<Trait> | RelationPair> =
    T extends RelationPair<infer R>
        ? ExtractSchema<R>
        : T extends Relation<infer R>
          ? ExtractSchema<R>
          : T extends Trait<infer S, any>
            ? S
            : never;

/** Extracts the store schema (TStoreSchema) from a Trait - used for Store typing */
export type ExtractStoreSchema<T extends Trait | Relation<Trait> | RelationPair> =
    T extends RelationPair<infer R>
        ? ExtractStoreSchema<R>
        : T extends Relation<infer R>
          ? ExtractStoreSchema<R>
          : T extends Trait<any, infer S>
            ? S
            : never;

/** Extracts the Store type from a Trait's createStore method */
export type ExtractStore<T extends Trait> = T extends { [$internal]: { createStore(): infer S } }
    ? S
    : never;

export type ExtractIsTag<T extends Trait> = T extends { [$internal]: { type: 'tag' } } ? true : false;

export type IsTag<T extends Trait> = ExtractIsTag<T>;

/**
 * Internal instance data for a registered trait in a world.
 *
 * @typeParam T - The Trait type
 * @typeParam S - The normalized schema (for entity.get() return types)
 */
export interface TraitInstance<T extends Trait = Trait, S extends Schema = ExtractSchema<T>> {
    generationId: number;
    bitflag: number;
    trait: Trait;
    /** The store uses ExtractStore to get the correct TypedArray types for typed traits */
    store: ExtractStore<T>;
    /** Non-tracking queries that include this trait */
    queries: Set<QueryInstance>;
    /** Tracking queries (Added/Removed/Changed) that include this trait */
    trackingQueries: Set<QueryInstance>;
    notQueries: Set<QueryInstance>;
    /** Queries that filter by this relation (only for relation traits) */
    relationQueries: Set<QueryInstance>;
    schema: S;
    changeSubscriptions: Set<(entity: Entity, target?: Entity) => void>;
    addSubscriptions: Set<(entity: Entity, target?: Entity) => void>;
    removeSubscriptions: Set<(entity: Entity, target?: Entity) => void>;
    /**
     * Only for relation traits.
     * For exclusive: relationTargets[eid] = targetId (number)
     * For non-exclusive: relationTargets[eid] = [targetId1, targetId2, ...] (number[])
     */
    relationTargets?: number[] | number[][];
}

export type TraitOrRelation = Trait | Relation<Trait>;

/** Extracts the underlying Trait from a TraitOrRelation (Relations contain a Trait) */
export type ExtractTrait<T> = T extends Relation<infer TTrait> ? TTrait : T;

/** Maps a tuple of TraitOrRelation to their underlying Traits */
export type ExtractTraits<T extends TraitOrRelation[]> = {
    [K in keyof T]: ExtractTrait<T[K]>;
};
