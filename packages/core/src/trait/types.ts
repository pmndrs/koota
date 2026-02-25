import { $internal, $orderedTargetsTrait } from '../common';
import type { Entity } from '../entity/types';
import type { QueryInstance } from '../query/types';
import type { Schema, Store, TagSchema } from '../storage';
import type { HiSparseBitSet } from '../utils/hi-sparse-bitset';
import type { OrderedList } from './ordered-list';

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

export type TraitDef<T = any, M extends TraitMode = TraitMode> = {
    /** Public read-only ID for fast array lookups */
    readonly id: number;
    readonly schema: Schema;
    [$internal]: {
        mode: M;
        hooks?: TraitHooks;
        accessors: TraitAccessors<T>;
        ctor: TraitConstructor<T>;
        exclusive?: boolean;
        autoDestroy?: 'orphan' | 'source' | 'target' | false;
    };
};

export type UnaryTraitCallable<T = any> = (params?: TraitPartial<T>) => [Trait<T>, TraitPartial<T>];

export interface BinaryTraitCallable<T = any> {
    (target: Entity, params?: TraitPartial<T>): Pair<T>;
    (target: '*'): PairPattern<T>;
}

/** Extracts mode from a TraitDef, falling back to 'unary'. */
export type ExtractMode<D> = D extends TraitDef<any, infer M> ? M : 'unary';

export type TraitCallable<T = any, M extends TraitMode = TraitMode> = M extends 'binary'
    ? BinaryTraitCallable<T>
    : UnaryTraitCallable<T>;

/**
 * A Trait, parameterized by the data shape T.
 * T is the type you get back when calling entity.get(Trait).
 */
export type Trait<T = any, M extends TraitMode = TraitMode> = TraitDef<T, M> & TraitCallable<T, M>;

export type TagTrait = Trait<Record<string, never>> & { readonly schema: TagSchema };

/**
 * The value type for setting/adding a trait.
 */
export type TraitValue<T> = T extends Record<string, never> ? undefined : Partial<T>;

/**
 * A tuple of [Trait, params] for adding a trait with initial values.
 */
export type TraitConfig<T extends Trait = Trait> = [T, T extends Trait<infer D> ? Partial<D> : never];

export type TraitLike<T extends Trait = Trait> = T | TraitConfig<T> | Pair;

export type SetTraitCallback<T extends Trait | Pair | PairPattern> = (
    prev: ExtractType<T>
) => Partial<ExtractType<T>>;

/**
 * The record/data shape of a trait.
 * This is what you get when calling entity.get(Trait).
 */
export type TraitRecord<T extends Trait> = T extends Trait<infer D> ? D : never;

// Relation types

/** A Relation is a Trait in binary mode. */
export type Relation<T = any> = Trait<T, 'binary'>;

export type PairTarget = Entity | '*';

/** A concrete pair — relation + entity target, optionally with init data. */
export type Pair<T = any> = [relation: Relation<T>, target: Entity, params?: TraitPartial<T>];

/** A pair pattern — allows wildcard target. Used in queries, has, and remove. */
export type PairPattern<T = any> = [relation: Relation<T>, target: PairTarget, params?: unknown];

export type OrderedRelation<T = any> = Trait<OrderedList, 'unary'> & {
    [$orderedTargetsTrait]: {
        relation: Relation<T>;
    };
};

// Trait instance types

export interface TraitInstance<T extends Trait = Trait> {
    generationId: number;
    bitflag: number;
    /** Per-trait membership bitset — tracks which entities have this trait. */
    bitSet: HiSparseBitSet;
    definition: TraitDef;
    store: Store<ExtractType<T>>;
    // Snapshotted from definition at registration
    mode: TraitMode;
    accessors: TraitAccessors<ExtractType<T>>;
    ctor: TraitConstructor<ExtractType<T>>;
    /** Non-tracking queries that include this trait */
    queries: QueryInstance[];
    /** Tracking queries (Added/Removed/Changed) that include this trait */
    trackingQueries: QueryInstance[];
    notQueries: QueryInstance[];
    /** Queries that filter by this relation (only for relation traits) */
    relationQueries: QueryInstance[];
    changeSubscriptions: Set<(entity: Entity, target?: Entity) => void>;
    addSubscriptions: Set<(entity: Entity, target?: Entity) => void>;
    removeSubscriptions: Set<(entity: Entity, target?: Entity) => void>;
    /**
     * Only for binary (relation) traits.
     * relationTargets[eid] = [targetId1, targetId2, ...]
     */
    relationTargets?: number[][];
    /**
     * Only for binary traits. Flat 1D store indexed by allocated slots.
     * Same schema/accessors as the unary store — the only difference is the index.
     */
    pairStore?: Store<ExtractType<T>>;
    /** slotMap[eid][localTargetIdx] = flatSlot into pairStore */
    slotMap?: number[][];
    /** Monotonic slot allocator */
    nextSlot?: number;
    /** Recycled slots for reuse */
    freeSlots?: number[];
    /**
     * Only for binary traits. Maps targetEid -> global compact pairId.
     * targetPairIds[targetEid] = globalCompactPairId | undefined
     */
    targetPairIds?: number[];
    /** Whether this relation is exclusive (one target per entity). */
    exclusive?: boolean;
    /** Auto-destroy behavior for this relation. */
    autoDestroy?: 'orphan' | 'source' | 'target' | false;
}

// Type extraction utilities

/**
 * Extracts the data type T from a Trait<T>, Pair, or PairPattern.
 */
export type ExtractType<T extends Trait | Pair | PairPattern> =
    T extends Pair<infer D>
        ? D
        : T extends PairPattern<infer D>
          ? D
          : T extends Trait<infer D>
            ? D
            : never;

export type ExtractStore<T extends Trait> = T extends Trait<infer D> ? Store<D> : never;

export type ExtractIsTag<T extends Trait> = T extends { readonly schema: { kind: 'tag' } }
    ? true
    : false;

export type IsTag<T extends Trait> = ExtractIsTag<T>;
