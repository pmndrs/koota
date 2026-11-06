import type { WorldContext } from '../../world/types';
import { MAX_PAGES, PAGE_SIZE } from './pack-entity';

export type PageAllocator = {
  /** Per-page generation values (pageId -> Uint8Array(PAGE_SIZE)). */
  generations: (Uint8Array | undefined)[];
  /** Stack of released page IDs available for leasing. */
  freePages: number[];
  /** Next fresh page ID to allocate. */
  pageCursor: number;
  /**
   * Maps pageId -> owning WorldContext. A world that owns its allocator only finds itself here,
   * a cycle nothing else refers to. Worlds that share one are found through it by entity methods.
   */
  pageOwners: (WorldContext | null)[];
};

/** A world passes a table of its own. Worlds that share an allocator share the table. */
export function createPageAllocator(pageOwners: (WorldContext | null)[]): PageAllocator {
  return { generations: [], freePages: [], pageCursor: 0, pageOwners };
}

/** The allocator of a destroyed world. It hands out no page, so nothing can be spawned there. */
export const closedAllocator: PageAllocator = {
  generations: [],
  freePages: [],
  pageCursor: MAX_PAGES,
  pageOwners: [],
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
