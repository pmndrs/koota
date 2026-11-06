import type { WorldContext } from '../../world/types';
import { PAGE_SIZE } from './pack-entity';

/**
 * Four masks hold current traits, removed traits, traits held at destruction and traits with
 * a write pending for their Changed queries. Entity slots are shift-indexed as (eid & 1023) << 2.
 */
export const MASK_STRIDE = 4;
export const REMOVED_WORD = 1;
export const DESTROYED_WORD = 2;
export const PENDING_WORD = 3;

/** Shared sentinel for unallocated mask pages. Always reads as 0. Never write to it directly. */
export const EMPTY_MASK_PAGE: Uint32Array = new Uint32Array(PAGE_SIZE * MASK_STRIDE);

/**
 * A table of mask pages by page id, filled with sentinels. Every table in a world covers the
 * highest page the world has leased, so a read for any of its entities finds a page. Pushing
 * keeps the elements packed, which a preallocated array would not be.
 */
export function createPageTable(pageLimit: number): Uint32Array[] {
  const table: Uint32Array[] = [];
  growPageTable(table, pageLimit);
  return table;
}

/** The number of pages every table of the world covers. */
export /* @pure */ function getPageLimit(ctx: WorldContext): number {
  return ctx.entityMasks[0].length;
}

/** Extend every table of the world when it leases a page past the ones they cover. */
export function growPageTables(ctx: WorldContext, pageLimit: number) {
  const masks = ctx.entityMasks;
  for (let g = 0; g < masks.length; g++) growPageTable(masks[g], pageLimit);
  for (const query of ctx.queriesHashMap.values()) {
    const groups = query.trackingGroups;
    for (let i = 0; i < groups.length; i++) {
      const trackers = groups[i].trackers;
      for (let j = 0; j < trackers.length; j++) {
        if (trackers[j]) growPageTable(trackers[j], pageLimit);
      }
    }
  }
}

function growPageTable(table: Uint32Array[], pageLimit: number) {
  for (let i = table.length; i < pageLimit; i++) table.push(EMPTY_MASK_PAGE);
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
