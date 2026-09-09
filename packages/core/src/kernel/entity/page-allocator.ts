import type { PageCleanupToken as CleanupHandle } from '../handles';
import type { KernelContext } from '../context';
import { GENERATION_MASK, MAX_PAGES, PAGE_SIZE } from './pack-entity';

export type PageCleanupToken = CleanupHandle & {
  readonly allocator: PageAllocator;
  readonly contexts: (KernelContext | null)[];
  ownedPages: number[];
  registered: boolean;
  contextId: number;
};

export type PageAllocator = {
  /** Low eight bits hold the generation, bit eight marks live, and 512 means retired. */
  slots: (Uint16Array | null)[];
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
  const slots: (Uint16Array | null)[] = [];
  const pageAliveCounts: number[] = [];
  const pageOwners: (KernelContext | null)[] = [];
  for (let i = 0; i < MAX_PAGES; i++) {
    slots[i] = null;
    pageAliveCounts[i] = 0;
    pageOwners[i] = null;
  }
  return {
    slots,
    pageAliveCounts,
    freePages: [],
    pageCursor: 0,
    pageOwners,
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
  if (!allocator.slots[pageId]) {
    allocator.slots[pageId] = new Uint16Array(PAGE_SIZE);
  }
  return pageId;
}

export function releasePage(allocator: PageAllocator, pageId: number): void {
  if (allocator.pageOwners[pageId] == null) return;
  allocator.pageAliveCounts[pageId] = 0;
  const slots = allocator.slots[pageId];
  if (slots) {
    for (let i = 0; i < slots.length; i++) {
      if (slots[i] === 512) continue;
      const next = (slots[i] & GENERATION_MASK) + 1;
      slots[i] = next > GENERATION_MASK ? 512 : next;
    }
  }
  allocator.pageOwners[pageId] = null;
  if (slots?.some((slot) => slot <= GENERATION_MASK)) allocator.freePages.push(pageId);
}

function reclaimEmptyPages(allocator: PageAllocator, needed: number): number {
  let reclaimed = 0;
  for (let pageId = 0; pageId < allocator.pageCursor && reclaimed < needed; pageId++) {
    if (allocator.pageOwners[pageId] === null) continue;
    if (allocator.pageAliveCounts[pageId] === 0) {
      revokePageFromOwner(allocator, pageId);
      releasePage(allocator, pageId);
      if (allocator.freePages.length) reclaimed++;
    }
  }
  return reclaimed;
}

function revokePageFromOwner(allocator: PageAllocator, pageId: number): void {
  const owner = allocator.pageOwners[pageId]!;
  const index = owner.entityIndex;
  index.sparse[pageId] = undefined;
  // Empty pages contain only recycled slots, never alive or reserved identities.
  let count = index.aliveCount;
  for (let i = count; i < index.dense.length; i++) {
    const entity = index.dense[i];
    if ((entity & 0x3fffff) >>> 10 !== pageId) index.dense[count++] = entity;
  }
  index.dense.length = count;
  const position = index.ownedPages.indexOf(pageId);
  if (position >= 0) {
    index.ownedPages.splice(position, 1);
    index.pageCursors.splice(position, 1);
    index.currentPageIdx = index.ownedPages.length - 1;
  }
}
