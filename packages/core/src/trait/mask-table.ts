import { PAGE_SIZE } from '../entity/handle';
import { sharedAllocator } from '../entity/page-allocator';
import { growPageTable } from '../entity/page-table';
import { $internal } from '../internal';
import type { WorldContext } from '../world/types';
import type { Trait } from './types';

/**
 * The layout of ctx.entityMasks. Four words per entity hold current traits, removed traits,
 * traits held at destruction and traits with a write pending for their Changed queries. Entity
 * slots are shift-indexed as (eid & 1023) << 2. A word covers 31 traits, one mask generation.
 *
 * Worlds with entity methods share one table per generation and one slot per trait. A page of
 * ids has one owner, so an entity method can read the trait's bit directly. Isolated worlds
 * assign slots in local registration order and keep their own tables.
 */
const MASK_STRIDE = 4;
export const REMOVED_WORD = 1;
export const DESTROYED_WORD = 2;
export const PENDING_WORD = 3;

/** Shared sentinel for unallocated mask pages. Always reads as 0. Never write to it directly. */
export const EMPTY_MASK_PAGE: Uint32Array = new Uint32Array(PAGE_SIZE * MASK_STRIDE);

/** The mask tables of the worlds that share entity ids, by generation. Entity methods read these. */
export const sharedMaskTables: Uint32Array[][] = [];

/**
 * The table of a trait no shared world has registered. Every page in it is the empty one. It also
 * records how many pages the shared tables cover.
 */
export const sharedEmptyMaskTable: Uint32Array[] = [];

/** Held by the trait definition. Only worlds with entity methods count as users. */
export type SharedMaskSlot = {
  slot: number;
  users: number;
  table: Uint32Array[];
  bit: number;
};

let nextSlot = 0;
const freeSlots: number[] = [];

export function claimMaskSlot(mask: SharedMaskSlot): number {
  if (mask.users++ === 0) {
    const slot = freeSlots.length > 0 ? freeSlots.pop()! : nextSlot++;
    mask.slot = slot;
    mask.table = sharedMaskTables[(slot / 31) | 0] ??= sharedEmptyMaskTable.slice();
    mask.bit = 1 << (slot % 31);
  }
  return mask.slot;
}

export function releaseMaskSlots(traits: Set<Trait>, lastWorld: boolean) {
  for (const trait of traits) {
    const mask = trait[$internal].sharedMask;
    if (--mask.users !== 0) continue;
    if (!lastWorld) freeSlots.push(mask.slot);
    mask.slot = -1;
    mask.table = sharedEmptyMaskTable;
    mask.bit = 0;
  }
  // The next shared world packs its traits from slot zero and sizes the tables to its pages.
  if (lastWorld) {
    nextSlot = 0;
    freeSlots.length = 0;
    sharedMaskTables.length = 0;
    sharedEmptyMaskTable.length = 0;
  }
}

/** Extend the mask tables that this world reads when it leases another page. */
export function growMaskTables(ctx: WorldContext, pageLimit: number) {
  if (ctx.entityIndex.allocator === sharedAllocator) {
    if (pageLimit > sharedEmptyMaskTable.length) {
      growPageTable(sharedEmptyMaskTable, pageLimit, EMPTY_MASK_PAGE);
      for (const table of sharedMaskTables) growPageTable(table, pageLimit, EMPTY_MASK_PAGE);
    }
  } else {
    for (const table of ctx.entityMasks) growPageTable(table, pageLimit, EMPTY_MASK_PAGE);
  }
}

/** Materialize an entity mask page on first membership write. Returns the writable page. */
export function createMaskPage(gen: Uint32Array[], pageId: number): Uint32Array {
  const page = new Uint32Array(PAGE_SIZE * MASK_STRIDE);
  gen[pageId] = page;
  return page;
}

/** Lets go of the mask pages a world wrote for the pages of ids it owns. */
export function clearMaskPages(tables: Uint32Array[][], ownedPages: number[]) {
  for (const table of tables) {
    for (const pageId of ownedPages) table[pageId] = EMPTY_MASK_PAGE;
  }
}
