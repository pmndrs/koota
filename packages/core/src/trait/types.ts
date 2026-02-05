import { $internal } from '../common';
import type { Entity } from '../entity/types';
import type { QueryInstance } from '../query/types';
import type { Relation, RelationPair } from '../relation/types';
import type {
    AoSFactory,
    Definition,
    DefinitionFor,
    InferDefinition,
    Schema,
    Store,
    StoreType,
} from '../storage';

// Backwards-compatible alias (the trait "type" is the storage layout).
export type TraitType = StoreType;

/**
 * Helper type for trait values that handles arrays correctly.
 * Arrays are atomic and don't need Partial, but objects use Partial for partial updates.
 */
export type TraitPartial<T> = T extends any[] ? T : Partial<T>;

/**
 * A Trait, parameterized by the data shape T.
 * T is the type you get back when calling entity.get(Trait).
 */
export type Trait<T = any> = {
    /** Public read-only ID for fast array lookups */
    readonly id: number;
    /** The canonical schema (metadata about each field) */
    readonly schema: Schema;
    [$internal]: {
        set: (index: number, store: any, value: TraitPartial<T>) => void;
        fastSet: (index: number, store: any, value: TraitPartial<T>) => boolean;
        fastSetWithChangeDetection: (index: number, store: any, value: TraitPartial<T>) => boolean;
        get: (index: number, store: any) => T;
        id: number;
        createStore: () => Store<T>;
        /** Get default values for this trait (calls factory for AoS, returns schema defaults for SoA) */
        getDefault: () => T | null;
        /** Reference to parent relation if this trait is owned by a relation */
        relation: Relation<any> | null;
        type: StoreType;
    };
} & ((params?: TraitPartial<T>) => [Trait<T>, TraitPartial<T>]);

export type TagTrait = Trait<Record<string, never>> & { [$internal]: { type: 'tag' } };

/**
 * The value type for setting/adding a trait.
 */
export type TraitValue<T> = T extends Record<string, never> ? undefined : Partial<T>;

/**
 * A tuple of [Trait, params] for adding a trait with initial values.
 */
export type TraitTuple<T extends Trait = Trait> = [T, T extends Trait<infer D> ? Partial<D> : never];

export type ConfigurableTrait<T extends Trait = Trait> = T | TraitTuple<T> | RelationPair<T>;

export type SetTraitCallback<T extends Trait | RelationPair> = (
    prev: ExtractType<T>
) => Partial<ExtractType<T>>;

/**
 * The record/data shape of a trait.
 * This is what you get when calling entity.get(Trait).
 */
export type TraitRecord<T extends Trait> = T extends Trait<infer D> ? D : never;

// ============================================================================
// Type Extraction Utilities
// ============================================================================

/**
 * Extracts the data type T from a Trait<T>, Relation, or RelationPair.
 */
export type ExtractType<T extends Trait | Relation<Trait> | RelationPair> =
    T extends RelationPair<infer R>
        ? ExtractType<R>
        : T extends Relation<infer R>
          ? ExtractType<R>
          : T extends Trait<infer D>
            ? D
            : never;

/** @deprecated Use ExtractType instead */
export type ExtractDefinition<T extends Trait | Relation<Trait> | RelationPair> = ExtractType<T>;

/** @deprecated Use ExtractType instead */
export type ExtractSchema<T extends Trait | Relation<Trait> | RelationPair> = ExtractType<T>;

export type ExtractStore<T extends Trait> = T extends Trait<infer D> ? Store<D> : never;

export type ExtractIsTag<T extends Trait> = T extends { [$internal]: { type: 'tag' } } ? true : false;

export type IsTag<T extends Trait> = ExtractIsTag<T>;

// ============================================================================
// Trait Instance (internal runtime data)
// ============================================================================

export interface TraitInstance<T extends Trait = Trait> {
    generationId: number;
    bitflag: number;
    trait: Trait;
    store: Store<ExtractType<T>>;
    /** Non-tracking queries that include this trait */
    queries: Set<QueryInstance>;
    /** Tracking queries (Added/Removed/Changed) that include this trait */
    trackingQueries: Set<QueryInstance>;
    notQueries: Set<QueryInstance>;
    /** Queries that filter by this relation (only for relation traits) */
    relationQueries: Set<QueryInstance>;
    /** The canonical schema (metadata about each field) */
    schema: Schema;
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

// ============================================================================
// Trait Function Overloads (for type inference)
// ============================================================================

/**
 * Creates a trait with explicit type T and validates the definition.
 */
export type TraitFnWithType = <T>(definition: DefinitionFor<T>) => Trait<T>;

/**
 * Creates a trait and infers the type from the definition.
 */
export type TraitFnInferred = <D extends Definition>(definition: D) => Trait<InferDefinition<D>>;

/**
 * Creates a tag trait (no data).
 */
export type TraitFnTag = () => TagTrait;
