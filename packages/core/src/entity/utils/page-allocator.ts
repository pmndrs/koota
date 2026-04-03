import type { WorldInternal } from '../../world/types';
import { MAX_PAGES, PAGE_SIZE } from './pack-entity';

export type PageCleanupToken = {
    ownedPages: number[];
    registered: boolean;
};

export type PageAllocator = {
    /** Per-page generation values (pageId -> Uint16Array(PAGE_SIZE)). */
    generations: (Uint16Array | null)[];
    /** Per-page alive bitsets (pageId -> Uint32Array(PAGE_SIZE / 32)). */
    alive: (Uint32Array | null)[];
    /** Stack of released page IDs available for leasing. */
    freePages: number[];
    /** Next fresh page ID to allocate. */
    pageCursor: number;
    /** Maps pageId -> owning WorldInternal. */
    pageOwners: (WorldInternal | null)[];
    /** Safety-net cleanup for GC'd worlds. */
    worldFinalizer: FinalizationRegistry<PageCleanupToken>;
};

const ALIVE_WORDS = PAGE_SIZE >>> 5; // 32 words for 1024 bits

export function createPageAllocator(): PageAllocator {
    const allocator: PageAllocator = {
        generations: new Array(MAX_PAGES).fill(null),
        alive: new Array(MAX_PAGES).fill(null),
        freePages: [],
        pageCursor: 0,
        pageOwners: new Array(MAX_PAGES).fill(null),
        worldFinalizer: null!,
    };

    allocator.worldFinalizer = new FinalizationRegistry<PageCleanupToken>((token) => {
        if (!token.registered) return;
        for (const pageId of token.ownedPages) {
            const aliveBits = allocator.alive[pageId];
            if (aliveBits) aliveBits.fill(0);
            allocator.pageOwners[pageId] = null;
            allocator.freePages.push(pageId);
        }
        token.ownedPages.length = 0;
    });

    return allocator;
}

export function leasePage(allocator: PageAllocator, owner: WorldInternal): number {
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
        allocator.generations[pageId] = new Uint16Array(PAGE_SIZE);
    }
    if (!allocator.alive[pageId]) {
        allocator.alive[pageId] = new Uint32Array(ALIVE_WORDS);
    }
    return pageId;
}

export function releasePage(allocator: PageAllocator, pageId: number): void {
    allocator.pageOwners[pageId] = null;
    allocator.freePages.push(pageId);
}

function isPageEmpty(alive: Uint32Array): boolean {
    for (let i = 0; i < alive.length; i++) {
        if (alive[i] !== 0) return false;
    }
    return true;
}

function reclaimEmptyPages(allocator: PageAllocator, needed: number): number {
    let reclaimed = 0;
    for (let pageId = 0; pageId < allocator.pageCursor && reclaimed < needed; pageId++) {
        if (allocator.pageOwners[pageId] === null) continue;
        const alive = allocator.alive[pageId];
        if (alive && isPageEmpty(alive)) {
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

/** Count trailing zeros (finds the first set bit). Returns 32 if word is 0. */
export function ctz32(word: number): number {
    if (word === 0) return 32;
    return Math.clz32(word & -word) ^ 31;
}
