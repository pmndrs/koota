import type { Schema } from './types';

/**
 * block-aligned soa store
 *
 * data is split into blocks of 1024 entries that line up with the bitset's l1 groups
 * (32 words × 32 bits = 1024 entity ids per group)
 *
 * for each soa key: store.x = [block0, block1, ...] where each block is an array of 1024 entries
 * access is - store.x[eid >>> 10][eid & 1023]
 *
 * this allocates blocks that actually contain entities
 */

export const BLOCK_SHIFT = 10;
export const BLOCK_SIZE = 1 << BLOCK_SHIFT; // 1024
export const BLOCK_MASK = BLOCK_SIZE - 1; // 0x3FF

export function createStore(schema: Schema): unknown {
    switch (schema.kind) {
        case 'aos':
            return [];
        case 'tag':
            return {};
        case 'soa': {
            const store: Record<string, (unknown[] | null)[]> = {};
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
