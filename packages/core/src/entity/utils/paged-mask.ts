import type { WorldContext } from '../../world';
import { MAX_PAGES, PAGE_SIZE } from './pack-entity';

/** Shared sentinel for unallocated mask pages. Always reads as 0. Never write to it directly. */
export const EMPTY_MASK_PAGE: Uint32Array = new Uint32Array(PAGE_SIZE);

/** Create a new mask generation array pre-filled with sentinels. */
export function createEmptyMaskGeneration(): Uint32Array[] {
  const gen = new Array<Uint32Array>(MAX_PAGES);
  gen.fill(EMPTY_MASK_PAGE);
  return gen;
}

/**
 * Shared sentinel for unallocated history pages. Seeds read it as 0 and mask it with membership,
 * so a stray write from a production misuse cannot leak into membership checks.
 */
export const EMPTY_HISTORY_PAGE: Uint32Array = new Uint32Array(PAGE_SIZE);

/** Create a history generation array pre-filled with the history sentinel. */
export function createEmptyHistoryGeneration(): Uint32Array[] {
  const gen = new Array<Uint32Array>(MAX_PAGES);
  gen.fill(EMPTY_HISTORY_PAGE);
  return gen;
}

/**
 * Materialize a membership page together with its history pages, so the remove, set and destroy
 * paths can write history without a branch or a call.
 */
export function materializeMaskPages(ctx: WorldContext, generationId: number, pageId: number) {
  ctx.entityMasks[generationId][pageId] = new Uint32Array(PAGE_SIZE);
  ctx.removedMasks[generationId][pageId] = new Uint32Array(PAGE_SIZE);
  ctx.changedMasks[generationId][pageId] = new Uint32Array(PAGE_SIZE);
  ctx.destroyedMasks[generationId][pageId] = new Uint32Array(PAGE_SIZE);
}

/** Materialize a mask page on first write. Returns the writable page. */
export /* @inline */ function ensureMaskPage(gen: Uint32Array[], pageId: number): Uint32Array {
  let page = gen[pageId];
  if (page === EMPTY_MASK_PAGE) {
    page = new Uint32Array(PAGE_SIZE);
    gen[pageId] = page;
  }
  return page;
}
