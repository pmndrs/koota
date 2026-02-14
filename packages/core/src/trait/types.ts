import { $internal } from '../common';
import type { Entity } from '../entity/types';
import type { QueryInstance } from '../query/types';
import type { Relation, RelationPair } from '../relation/types';
import type { Schema, Store, TagSchema } from '../storage';

/**
 * Helper type for trait values that handles arrays correctly.
 * Arrays are atomic and don't need Partial, but objects use Partial for partial updates.
 */
export type TraitPartial<T> = T extends any[] ? T : Partial<T>;

export type TraitHook = (...args: unknown[]) => void;

export type TraitHooks = {
    onSet?: TraitHook;
    onAdd?: TraitHook;
    onRemove?: TraitHook;
    onTargetDestroy?: TraitHook;
};

export type TraitAccessors<T = any> = {
    set: (index: number, store: any, value: TraitPartial<T>) => void;
    fastSet: (index: number, store: any, value: TraitPartial<T>) => boolean;
    fastSetWithChangeDetection: (index: number, store: any, value: TraitPartial<T>) => boolean;
    get: (index: number, store: any) => T;
};

export type TraitConstructor<T = any> = () => T | null;

export type TraitMode = 'unary' | 'binary';

export type TraitDef<T = any, M extends TraitMode = 'unary'> = {
    /** Public read-only ID for fast array lookups */
    readonly id: number;
    readonly schema: Schema;
    [$internal]: {
        mode: M;
        hooks?: TraitHooks;
        accessors: TraitAccessors<T>;
        ctor: TraitConstructor<T>;
    };
};

export type UnaryTraitCallable<T = any> = (
    params?: TraitPartial<T>
) => [Trait<T, 'unary'>, TraitPartial<T>];

export type BinaryTraitCallable = (target: unknown, params?: unknown) => RelationPair;

/** Extracts mode from a TraitDef, falling back to 'unary'. */
export type ExtractMode<D> = D extends TraitDef<any, infer M> ? M : 'unary';

export type TraitCallable<T = any, M extends TraitMode = 'unary'> = M extends 'binary'
    ? BinaryTraitCallable
    : UnaryTraitCallable<T>;

/**
 * A Trait, parameterized by the data shape T.
 * T is the type you get back when calling entity.get(Trait).
 */
export type Trait<T = any, M extends TraitMode = 'unary'> = TraitDef<T, M> & TraitCallable<T, M>;

export type TagTrait = Trait<Record<string, never>> & { readonly schema: TagSchema };

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

export type ExtractStore<T extends Trait> = T extends Trait<infer D> ? Store<D> : never;

export type ExtractIsTag<T extends Trait> = T extends { readonly schema: { kind: 'tag' } }
    ? true
    : false;

export type IsTag<T extends Trait> = ExtractIsTag<T>;

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
     * relationTargets[eid] = [targetId1, targetId2, ...]
     */
    relationTargets?: number[][];
}

export type TraitOrRelation = Trait | Relation<Trait>;

/** Extracts the underlying Trait from a TraitOrRelation (Relations contain a Trait) */
export type ExtractTrait<T> = T extends Relation<infer TTrait> ? TTrait : T;

/** Maps a tuple of TraitOrRelation to their underlying Traits */
export type ExtractTraits<T extends TraitOrRelation[]> = {
    [K in keyof T]: ExtractTrait<T[K]>;
};
