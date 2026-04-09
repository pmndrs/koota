import type { WorldContext } from '../../world/types';
import { MAX_PAGES, PAGE_SIZE } from './pack-entity';

export type PageCleanupToken = {
    ownedPages: number[];
    registered: boolean;
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
    /** Maps pageId -> owning WorldContext. */
    pageOwners: (WorldContext | null)[];
    /** Safety-net cleanup for GC'd worlds. */
    worldFinalizer: FinalizationRegistry<PageCleanupToken>;
};

export function createPageAllocator(): PageAllocator {
    const allocator: PageAllocator = {
        generations: new Array(MAX_PAGES).fill(null),
        pageAliveCounts: new Array(MAX_PAGES).fill(0),
        freePages: [],
        pageCursor: 0,
        pageOwners: new Array(MAX_PAGES).fill(null),
        worldFinalizer: null!,
    };

    allocator.worldFinalizer = new FinalizationRegistry<PageCleanupToken>((token) => {
        if (!token.registered) return;
        for (const pageId of token.ownedPages) {
            allocator.pageAliveCounts[pageId] = 0;
            allocator.pageOwners[pageId] = null;
            allocator.freePages.push(pageId);
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
