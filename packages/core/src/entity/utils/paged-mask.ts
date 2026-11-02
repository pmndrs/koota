import { MAX_PAGES, PAGE_SIZE } from './pack-entity';

/**
 * Every mask of an entity sits in one page at a stride of four words: the traits it holds, the
 * traits it lost and has not regained, the traits written since it spawned, and the traits it
 * held when destroyed. A destroy clears one cache line and a remove writes the word it has
 * already loaded. The slot of an entity is (eid & 1023) << 2.
 */
export const MASK_STRIDE = 4;
export const REMOVED_WORD = 1;
export const CHANGED_WORD = 2;
export const DESTROYED_WORD = 3;

/** Shared sentinel for unallocated mask pages. Always reads as 0. Never write to it directly. */
export const EMPTY_MASK_PAGE: Uint32Array = new Uint32Array(PAGE_SIZE * MASK_STRIDE);

/** Create a new mask generation array pre-filled with sentinels. */
export function createEmptyMaskGeneration(): Uint32Array[] {
  const gen = new Array<Uint32Array>(MAX_PAGES);
  gen.fill(EMPTY_MASK_PAGE);
  return gen;
}

/** Materialize an entity mask page on first membership write. Returns the writable page. */
export function materializeMaskPage(gen: Uint32Array[], pageId: number): Uint32Array {
  const page = new Uint32Array(PAGE_SIZE * MASK_STRIDE);
  gen[pageId] = page;
  return page;
}

/** Materialize a tracker page on first write. Trackers hold one word per entity. */
export /* @inline */ function ensureMaskPage(gen: Uint32Array[], pageId: number): Uint32Array {
  let page = gen[pageId];
  if (page === EMPTY_MASK_PAGE) {
    page = new Uint32Array(PAGE_SIZE);
    gen[pageId] = page;
  }
  return page;
}
