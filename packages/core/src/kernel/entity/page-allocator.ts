import type { KernelContext } from '../context';
import { GENERATION_MASK, MAX_PAGES, PAGE_SIZE } from './pack-entity';

export type PageCleanupToken = {
  readonly allocator: PageAllocator;
  readonly contexts: (KernelContext | null)[];
  ownedPages: number[];
  registered: boolean;
  contextId?: number;
};

export type PageAllocator = {
  /** Per-page generation values (pageId -> Uint8Array(PAGE_SIZE)). */
  generations: (Uint8Array | null)[];
  /** Per-page alive entity count. O(1) emptiness check for reclamation. */
  pageAliveCounts: number[];
  /** Stack of released page IDs available for leasing. */
  freePages: number[];
  /** Next fresh page ID to allocate. */
  pageCursor: number;
  /** Maps pageId -> owning KernelContext. */
  pageOwners: (KernelContext | null)[];
};

export function createPageAllocator(): PageAllocator {
  return {
    generations: new Array(MAX_PAGES).fill(null),
    pageAliveCounts: new Array(MAX_PAGES).fill(0),
    freePages: [],
    pageCursor: 0,
    pageOwners: new Array(MAX_PAGES).fill(null),
  };
}

export function leasePage(allocator: PageAllocator, owner: KernelContext): number {
  let pageId: number;

  if (allocator.freePages.length > 0) {
    pageId = allocator.freePages.pop()!;
  } else if (allocator.pageCursor < MAX_PAGES) {
    pageId = allocator.pageCursor++;
  } else {
    const reclaimed = reclaimEmptyPages(allocator, 1);
    if (reclaimed === 0) {
      throw new Error(
        `Koota: All ${MAX_PAGES} entity pages are in use. Cannot allocate more entities.`
      );
    }
    pageId = allocator.freePages.pop()!;
  }

  allocator.pageOwners[pageId] = owner;
  if (!allocator.generations[pageId]) {
    allocator.generations[pageId] = new Uint8Array(PAGE_SIZE);
  }
  return pageId;
}

export function releasePage(allocator: PageAllocator, pageId: number): void {
  if (allocator.pageOwners[pageId] == null) return;
  allocator.pageAliveCounts[pageId] = 0;
  const generations = allocator.generations[pageId];
  if (generations) {
    for (let i = 0; i < generations.length; i++) {
      generations[i] = (generations[i] + 1) & GENERATION_MASK;
    }
  }
  allocator.pageOwners[pageId] = null;
  allocator.freePages.push(pageId);
}

function reclaimEmptyPages(allocator: PageAllocator, needed: number): number {
  let reclaimed = 0;
  for (let pageId = 0; pageId < allocator.pageCursor && reclaimed < needed; pageId++) {
    if (allocator.pageOwners[pageId] === null) continue;
    if (allocator.pageAliveCounts[pageId] === 0) {
      revokePageFromOwner(allocator, pageId);
      allocator.freePages.push(pageId);
      reclaimed++;
    }
  }
  return reclaimed;
}

function revokePageFromOwner(allocator: PageAllocator, _pageId: number): void {
  allocator.pageOwners[_pageId] = null;
}
