export { S as SparseSet } from '../dist/sparse-set-CZJ5eHAh.js';

declare class Deque<T> {
    #private;
    dequeue(): T;
    enqueue(...items: T[]): void;
    get length(): number;
    clear(): void;
}

/**
 * Hierarchical Sparse BitSet
 * Credit goes to @tower120 for https://github.com/tower120/hi_sparse_bitset
 *
 * This is just a typescript rewrite of that library.
 */
/** Count trailing zeros — position of lowest set bit. */
declare function ctz32(v: number): number;
declare class HiSparseBitSet {
    /** L0 summary: bit i set means l1Summary[i] has data. */
    l0: number;
    /** L1 summary: l1Summary[l0i] bit j set means l2 block (l0i*32 + j) has data. */
    l1Summary: Uint32Array;
    /** L2 data blocks. l2Blocks[l1i] is a 32-element Uint32Array (pre-allocated to 32 null slots). */
    l2Blocks: (Uint32Array | null)[];
    private _size;
    get size(): number;
    /** Insert an entity index into the set. O(1) amortized. */
    insert(index: number): void;
    /** Remove an entity index from the set. O(1). */
    remove(index: number): void;
    /** Test membership. O(1). */
    has(index: number): boolean;
    /** Clear all entries. */
    clear(): void;
    /** Get L2 data block for branchless reads. Returns EMPTY_BLOCK if not allocated. */
    getBlock(blockIdx: number): Uint32Array;
    /** Create a deep copy of this bitset. */
    clone(): HiSparseBitSet;
    /** Iterate all set indices in sorted order via callback. Zero allocation. */
    forEach(callback: (index: number) => void): void;
    /** Iterate all set bits in ascending order AND clear them. After drain the bitset is empty. */
    drain(callback: (index: number) => void): void;
    /**
     * Set a contiguous range [start, end) using word-level ops.
     * A 100-entity subtree = ~3 word fills + 2 partial ORs vs 100 individual insert() calls.
     */
    setRange(start: number, end: number): void;
}
/**
 * High-performance N-way intersection iteration via callback.
 * Prunes at each hierarchy level — only visits entity IDs present in ALL sets.
 * Zero allocation during iteration.
 *
 * Returns the number of entities visited.
 */
declare function forEachIntersection(sets: HiSparseBitSet[], callback: (entityId: number) => void): number;
/**
 * N-way intersection with forbidden set exclusion.
 * The full ECS query pattern: required(A, B, C) AND NOT(D, E).
 *
 * Returns the number of entities visited.
 */
declare function forEachQuery(required: HiSparseBitSet[], forbidden: HiSparseBitSet[], callback: (entityId: number) => void): number;
/**
 * Collect intersection results into an array.
 */
declare function collectIntersection(sets: HiSparseBitSet[]): number[];
/**
 * Collect query results (required + forbidden) into an array.
 */
declare function collectQuery(required: HiSparseBitSet[], forbidden: HiSparseBitSet[]): number[];

export { Deque, HiSparseBitSet, collectIntersection, collectQuery, ctz32, forEachIntersection, forEachQuery };
