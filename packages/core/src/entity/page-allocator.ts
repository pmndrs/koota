import { sharedEmptyMaskTable, sharedMaskTables } from '../trait/mask-table';
import type { WorldContext } from '../world/types';
import { getEntityId, MAX_PAGES, PAGE_SIZE } from './handle';
import type { Entity, PageAllocator } from './types';

/** A world passes a table of its own. Worlds that share an allocator share the table. */
export function createPageAllocator(
  pageOwners: (WorldContext | null)[],
  maskTables: Uint32Array[][],
  emptyMaskTable: Uint32Array[]
): PageAllocator {
  return {
    generations: [],
    freePages: [],
    pageCursor: 0,
    pageOwners,
    maskTables,
    emptyMaskTable,
  };
}

/** The allocator of a destroyed world. It hands out no page, so nothing can be spawned there. */
export const closedAllocator: PageAllocator = {
  generations: [],
  freePages: [],
  pageCursor: MAX_PAGES,
  pageOwners: [],
  maskTables: [],
  emptyMaskTable: [],
};

export function leasePage(allocator: PageAllocator, owner: WorldContext): number {
  let pageId: number;

  if (allocator.freePages.length > 0) {
    pageId = allocator.freePages.pop()!;
  } else if (allocator.pageCursor < MAX_PAGES) {
    pageId = allocator.pageCursor++;
  } else {
    throw new Error(
      allocator === closedAllocator
        ? 'Koota: The world was destroyed and cannot spawn entities.'
        : `Koota: All ${MAX_PAGES} entity pages are in use. Cannot allocate more entities.`
    );
  }

  allocator.pageOwners[pageId] = owner;
  if (!allocator.generations[pageId]) {
    allocator.generations[pageId] = new Uint8Array(PAGE_SIZE);
  }
  return pageId;
}

/** Invalidate every handle before the page can be leased again. */
export function releasePage(allocator: PageAllocator, pageId: number): void {
  const generations = allocator.generations[pageId]!;
  for (let offset = 0; offset < PAGE_SIZE; offset++) generations[offset]++;
  allocator.pageOwners[pageId] = null;
  allocator.freePages.push(pageId);
}

/**
 * The one structure worlds with entity methods share. An entity is a number, so the page that
 * holds its id is how a method finds the world that owns it. The table holds each world until it
 * is destroyed, which is what an isolated world avoids by owning its ids.
 */
export const sharedPageOwners: (WorldContext | null)[] = [];
export const sharedAllocator = /* @__PURE__ */ createPageAllocator(
  sharedPageOwners,
  sharedMaskTables,
  sharedEmptyMaskTable
);

/** The world that owns a live entity of a world with entity methods. */
export /* @inline @pure */ function getEntityContext(entity: Entity): WorldContext {
  return sharedPageOwners[getEntityId(entity) >>> 10]!;
}
