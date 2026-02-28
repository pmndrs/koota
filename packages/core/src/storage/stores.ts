import type { Schema, SoASchema } from './types';

/**
 * block-aligned soa store.
 *
 * data is split into blocks of 1024 entries that line up with the bitset's l1 groups
 * (32 words × 32 bits = 1024 entity ids per group).
 *
 * for each soa key: store.x = [block0, block1, ...] where each block is either
 * a Float64Array(1024) for numeric-only traits or Array(1024) for mixed types.
 * access: store.x[eid >>> 10][eid & 1023]
 *
 * numeric-only traits use Float64Array for contiguous memory and zero boxing overhead.
 */

export const BLOCK_SHIFT = 10;
export const BLOCK_SIZE = 1 << BLOCK_SHIFT; // 1024
export const BLOCK_MASK = BLOCK_SIZE - 1; // 0x3FF

/** returns true if every field in a soa schema is a plain number (eligible for Float64Array). */
export function isNumericSoA(schema: SoASchema): boolean {
    for (const key in schema.fields) {
        if (schema.fields[key].kind !== 'number') return false;
    }
    return true;
}

export function createStore(schema: Schema): unknown {
    switch (schema.kind) {
        case 'aos':
            return [];
        case 'tag':
            return {};
        case 'soa': {
            const store: Record<string, (unknown[] | Float64Array | null)[]> = {};
            for (const key in schema.fields) {
                store[key] = [];
            }
            return store;
        }
    }
}

/** null out all field blocks at the given block index, freeing memory for empty regions. */
export function nullifyStoreBlock(store: Record<string, (unknown[] | null)[]>, blockIdx: number): void {
    for (const key in store) {
        store[key][blockIdx] = null;
    }
}