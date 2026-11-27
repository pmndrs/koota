import { PAGE_SIZE } from '../entity/handle';
import { createPageTable, growPageTable } from '../entity/page-table';

/**
 * The layout of ctx.entityMasks. Four words per entity hold current traits, removed traits,
 * traits held at destruction and traits with a write pending for their Changed queries. Entity
 * slots are shift-indexed as (eid & 1023) << 2. A word covers 31 traits, one mask generation.
 *
 * A generation has one page table for every world that shares entity ids. A page of ids belongs
 * to one world, so the table needs no world to read it. A trait has the same slot in every world,
 * a generation and a bit. So a membership test of an entity needs neither its world nor that
 * world's trait instance.
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

/** By trait id, the shared table of the trait's generation and its bit. */
export const slotTables: Uint32Array[][] = [];
export const slotBits: number[] = [];

/** By trait id, the slot a trait holds while a world has it registered, or -1. */
const slots: number[] = [];
const slotUsers: number[] = [];
const freeSlots: number[] = [];

/** Gives a new trait id its entries. A trait no world has registered tests false everywhere. */
export function addMaskSlot(traitId: number) {
  slots[traitId] = -1;
  slotTables[traitId] = sharedEmptyMaskTable;
  slotBits[traitId] = 0;
}

/** A world registers a trait. Returns the slot, which the trait keeps while any world uses it. */
export function claimMaskSlot(traitId: number): number {
  let slot = slots[traitId];
  if (slot === -1) {
    slot = freeSlots.length > 0 ? freeSlots.pop()! : slotUsers.length;
    slots[traitId] = slot;
    slotUsers[slot] = 0;
    slotTables[traitId] = ensureMaskTable(sharedMaskTables, sharedEmptyMaskTable, (slot / 31) | 0);
    slotBits[traitId] = 1 << (slot % 31);
  }
  slotUsers[slot]++;
  return slot;
}

/** A world lets go of a trait. The slot is free for another trait once no world uses it. */
export function releaseMaskSlot(traitId: number) {
  const slot = slots[traitId];
  if (--slotUsers[slot] !== 0) return;
  freeSlots.push(slot);
  addMaskSlot(traitId);
}

/** The table of a generation, created on first use to cover the pages its id space has leased. */
export function ensureMaskTable(
  tables: Uint32Array[][],
  empty: Uint32Array[],
  generation: number
): Uint32Array[] {
  for (let g = tables.length; g <= generation; g++) {
    tables.push(createPageTable(empty.length, EMPTY_MASK_PAGE));
  }
  return tables[generation];
}

/** Extend the mask tables of an id space when a world leases a page past the ones they cover. */
export function growMaskTables(tables: Uint32Array[][], empty: Uint32Array[], pageLimit: number) {
  growPageTable(empty, pageLimit, EMPTY_MASK_PAGE);
  for (let g = 0; g < tables.length; g++) growPageTable(tables[g], pageLimit, EMPTY_MASK_PAGE);
}

/** Materialize an entity mask page on first membership write. Returns the writable page. */
export function createMaskPage(gen: Uint32Array[], pageId: number): Uint32Array {
  const page = new Uint32Array(PAGE_SIZE * MASK_STRIDE);
  gen[pageId] = page;
  return page;
}

/** Lets go of the mask pages a world wrote for the pages of ids it owns. */
export function clearMaskPages(tables: Uint32Array[][], generations: number[], ownedPages: number[]) {
  for (const generation of generations) {
    const table = tables[generation];
    for (const pageId of ownedPages) table[pageId] = EMPTY_MASK_PAGE;
  }
}
