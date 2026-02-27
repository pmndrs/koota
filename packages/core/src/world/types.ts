import { ActionInstance } from '../actions/types';
import type { $internal } from '../common';
import type { Entity } from '../entity/types';
import type { createEntityIndex } from '../entity/utils/entity-index';
import type {
    Query,
    QueryInstance,
    QueryParameter,
    QueryResult,
    QueryUnsubscriber,
} from '../query/types';

import type {
    TraitLike,
    ExtractType,
    Relation,
    Pair,
    PairPattern,
    SetTraitCallback,
    Trait,
    TraitInstance,
} from '../trait/types';
import type { HiSparseBitSet } from '../utils/hi-sparse-bitset';
import type { SparseSet } from '../utils/sparse-set';

export type WorldOptions = {
    traits?: TraitLike[];
    lazy?: boolean;
};

export type WorldInternal = {
    entityIndex: ReturnType<typeof createEntityIndex>;

    entityTraits: Map<number, Set<Trait>>;

    traitInstances: (TraitInstance | undefined)[];
    relations: Set<Relation>;
    queriesHashMap: Map<string, QueryInstance>;
    queryInstances: (QueryInstance | undefined)[];
    actionInstances: (ActionInstance | undefined)[];
    notQueries: Set<QueryInstance>;
    dirtyQueries: Set<QueryInstance>;
    /** Per-tracking-ID, per-trait-ID HiSparseBitSets recording add events since tracking creation */
    addedBitSets: Map<number, Map<number, HiSparseBitSet>>;
    /** Per-tracking-ID, per-trait-ID HiSparseBitSets recording remove events since tracking creation */
    removedBitSets: Map<number, Map<number, HiSparseBitSet>>;
    /** Per-tracking-ID, per-trait-ID HiSparseBitSets recording change events since tracking creation */
    changedBitSets: Map<number, Map<number, HiSparseBitSet>>;
    trackingSnapshots: Map<number, Map<number, HiSparseBitSet>>;
    worldEntity: Entity;
    trackedTraits: Set<Trait>;
    resetSubscriptions: Set<(world: World) => void>;
    // Pair ID allocator — no Map, all integer-indexed arrays
    /** pairRefCount[pairId] = number of entities currently holding this pair */
    pairRefCount: number[];
    /** Monotonic pair ID allocator */
    pairNextId: number;
    /** Recycled pair IDs available for reuse */
    pairFreeIds: number[];
    /**
     * Per-entity pair membership sparse array.
     * entityPairIds[eid][pairId] = 1 (has pair) | 0 (does not have pair)
     * One integer-indexed array read for O(1) membership check.
     */
    entityPairIds: (number[] | undefined)[];
    /**
     * Per-pair query index.
     * pairQueries[pairId] = queries that filter by this exact (relation, target) combination.
     * Sparse array — only populated for exact-pair (non-wildcard) relation filters.
     */
    pairQueries: (QueryInstance[] | undefined)[];
    /**
     * Per-pair reverse index. pairEntities[pairId] = SparseSet of eids holding this pair.
     * Enables O(K) relation queries where K = matching entities.
     */
    pairEntities: (SparseSet | undefined)[];
    // Pair-level tracking (indexed by trackingGroupIdx, not Map)
    /** pairDirtyMasks[trackingGroupIdx][eid][pairId] = dirty flag for add/remove tracking */
    pairDirtyMasks: (number[][] | undefined)[];
    /** pairChangedMasks[trackingGroupIdx][eid][pairId] = changed flag for change tracking */
    pairChangedMasks: (number[][] | undefined)[];
};

export type World = {
    readonly id: number;
    readonly isInitialized: boolean;
    readonly entities: Entity[];
    readonly traits: Set<Trait>;
    [$internal]: WorldInternal;
    init(...traits: TraitLike[]): void;
    spawn(...traits: TraitLike[]): Entity;
    has(entity: Entity): boolean;
    has(trait: Trait): boolean;
    has(target: Entity | Trait): boolean;
    add(...traits: TraitLike[]): void;
    remove(...traits: Trait[]): void;
    get<T extends Trait>(trait: T): ExtractType<T> | undefined;
    set<T extends Trait>(trait: T, value: Partial<ExtractType<T>> | SetTraitCallback<T>): void;
    destroy(): void;
    reset(): void;
    query<T extends QueryParameter[]>(key: Query<T>): QueryResult<T>;
    query<T extends QueryParameter[]>(...parameters: T): QueryResult<T>;
    queryFirst<T extends QueryParameter[]>(key: Query<T>): Entity | undefined;
    queryFirst<T extends QueryParameter[]>(...parameters: T): Entity | undefined;
    onQueryAdd<T extends QueryParameter[]>(
        key: Query<T>,
        callback: (entity: Entity) => void
    ): QueryUnsubscriber;
    onQueryAdd<T extends QueryParameter[]>(
        parameters: T,
        callback: (entity: Entity) => void
    ): QueryUnsubscriber;
    onQueryRemove<T extends QueryParameter[]>(
        key: Query<T>,
        callback: (entity: Entity) => void
    ): QueryUnsubscriber;
    onQueryRemove<T extends QueryParameter[]>(
        parameters: T,
        callback: (entity: Entity) => void
    ): QueryUnsubscriber;
    onAdd(
        input: Trait | PairPattern,
        callback: (entity: Entity, target?: Entity) => void
    ): QueryUnsubscriber;
    onRemove(
        input: Trait | PairPattern,
        callback: (entity: Entity, target?: Entity) => void
    ): QueryUnsubscriber;
    onChange(
        input: Trait | PairPattern,
        callback: (entity: Entity, target?: Entity) => void
    ): QueryUnsubscriber;
};
