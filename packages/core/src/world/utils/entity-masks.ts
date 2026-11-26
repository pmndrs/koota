import { PAGE_SIZE } from '../../entity/utils/pack-entity';

/**
 * The layout of ctx.entityMasks. Four words per entity hold current traits, removed traits,
 * traits held at destruction and traits with a write pending for their Changed queries. Entity
 * slots are shift-indexed as (eid & 1023) << 2.
 */
export const MASK_STRIDE = 4;
export const REMOVED_WORD = 1;
export const DESTROYED_WORD = 2;
export const PENDING_WORD = 3;

/** Shared sentinel for unallocated mask pages. Always reads as 0. Never write to it directly. */
export const EMPTY_MASK_PAGE: Uint32Array = new Uint32Array(PAGE_SIZE * MASK_STRIDE);

/** Materialize an entity mask page on first membership write. Returns the writable page. */
export function materializeMaskPage(gen: Uint32Array[], pageId: number): Uint32Array {
  const page = new Uint32Array(PAGE_SIZE * MASK_STRIDE);
  gen[pageId] = page;
  return page;
}
