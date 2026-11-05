import type { WorldContext } from '../../world/types';
import { MAX_PAGES, PAGE_SIZE } from './pack-entity';

export type PageCleanupToken = {
  ownedPages: number[];
  registered: boolean;
};

export type PageAllocator = {
  /** Per-page generation values (pageId -> Uint8Array(PAGE_SIZE)). */
  generations: (Uint8Array | null)[];
  /** Stack of released page IDs available for leasing. */
  freePages: number[];
  /** Next fresh page ID to allocate. */
  pageCursor: number;
  /** Maps pageId -> owning WorldContext. */
  pageOwners: (WorldContext | null)[];
  /** Safety-net cleanup for GC'd worlds. */
  worldFinalizer: FinalizationRegistry<PageCleanupToken>;
};

export function createPageAllocator(): PageAllocator {
  const allocator: PageAllocator = {
    generations: new Array(MAX_PAGES).fill(null),
    freePages: [],
    pageCursor: 0,
    pageOwners: new Array(MAX_PAGES).fill(null),
    worldFinalizer: null!,
  };

  allocator.worldFinalizer = new FinalizationRegistry<PageCleanupToken>((token) => {
    if (!token.registered) return;
    for (const pageId of token.ownedPages) {
      releasePage(allocator, pageId);
    }
    token.ownedPages.length = 0;
  });

  return allocator;
}

export function leasePage(allocator: PageAllocator, owner: WorldContext): number {
  let pageId: number;

  if (allocator.freePages.length > 0) {
    pageId = allocator.freePages.pop()!;
  } else if (allocator.pageCursor < MAX_PAGES) {
    pageId = allocator.pageCursor++;
  } else {
    throw new Error(
      `Koota: All ${MAX_PAGES} entity pages are in use. Cannot allocate more entities.`
    );
  }

  allocator.pageOwners[pageId] = owner;
  if (!allocator.generations[pageId]) {
    allocator.generations[pageId] = new Uint8Array(PAGE_SIZE);
  }
  return pageId;
}

/** Invalidate every handle before the page can be leased by another world. */
export function releasePage(allocator: PageAllocator, pageId: number): void {
  const generations = allocator.generations[pageId]!;
  for (let offset = 0; offset < PAGE_SIZE; offset++) generations[offset]++;
  allocator.pageOwners[pageId] = null;
  allocator.freePages.push(pageId);
}
