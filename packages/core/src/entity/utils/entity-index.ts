import type { WorldInternal } from '../../world/types';
import type { Entity } from '../types';
import {
    GENERATION_MASK,
    PAGE_SIZE,
    getEntityGeneration,
    getEntityId,
    packEntity,
} from './pack-entity';
import type { PageAllocator } from './page-allocator';
import { leasePage } from './page-allocator';

export type EntityIndex = {
    /** The number of currently alive entities. */
    aliveCount: number;
    /** Dense list of alive packed entities. */
    dense: Entity[];
    /** Sparse: entityId -> index in dense (or undefined). */
    sparse: number[];
    /** Dense list of leased page IDs. */
    ownedPages: number[];
    /** Per-page cursor: next fresh offset to allocate from (parallel to ownedPages). */
    pageCursors: number[];
    /** Index into ownedPages of the page we're currently filling. */
    currentPageIdx: number;
    /** Reference to the global page allocator. */
    allocator: PageAllocator;
    /** The owning WorldInternal context (for page leasing). */
    owner: WorldInternal;
};

export const createEntityIndex = (allocator: PageAllocator, owner: WorldInternal): EntityIndex => ({
    aliveCount: 0,
    dense: [],
    sparse: [],
    ownedPages: [],
    pageCursors: [],
    currentPageIdx: -1,
    allocator,
    owner,
});

export const allocateEntity = (index: EntityIndex): Entity => {
    const allocator = index.allocator;
    let entity: Entity;
    let entityId: number;

    if (index.aliveCount < index.dense.length) {
        // Recycle: dense[aliveCount] already has the pre-packed entity with bumped gen
        // (written by releaseEntity). No TypedArray reads needed.
        entity = index.dense[index.aliveCount];
        entityId = getEntityId(entity);
    } else {
        // Fresh allocation from page cursor.
        if (index.currentPageIdx === -1 || index.pageCursors[index.currentPageIdx] >= PAGE_SIZE) {
            const pid = leasePage(allocator, index.owner);
            index.ownedPages.push(pid);
            index.pageCursors.push(0);
            index.currentPageIdx = index.ownedPages.length - 1;
        }

        const pid = index.ownedPages[index.currentPageIdx];
        const offset = index.pageCursors[index.currentPageIdx]++;
        entityId = pid * PAGE_SIZE + offset;
        // Read gen from TypedArray — handles re-leased pages where gen > 0.
        const gen = allocator.generations[entityId >>> 10]![offset];
        entity = packEntity(gen, entityId);
    }

    allocator.pageAliveCounts[entityId >>> 10]++;

    const denseIdx = index.aliveCount;
    index.sparse[entityId] = denseIdx;
    if (denseIdx < index.dense.length) {
        index.dense[denseIdx] = entity;
    } else {
        index.dense.push(entity);
    }
    index.aliveCount++;

    return entity;
};

export const releaseEntity = (index: EntityIndex, entity: Entity): void => {
    const entityId = getEntityId(entity);
    const denseIdx = index.sparse[entityId];
    if (denseIdx === undefined || denseIdx >= index.aliveCount) return;

    const allocator = index.allocator;
    const pageId = entityId >>> 10;
    const offset = entityId & 1023;

    allocator.pageAliveCounts[pageId]--;

    // Bump generation and persist to both dense (for fast recycle) and TypedArray (for page re-lease safety).
    const nextGen = (getEntityGeneration(entity) + 1) & GENERATION_MASK;
    allocator.generations[pageId]![offset] = nextGen;
    const deadEntry = packEntity(nextGen, entityId);

    // Swap with last alive in dense array.
    const lastIdx = index.aliveCount - 1;
    const lastEntity = index.dense[lastIdx];
    const lastId = getEntityId(lastEntity);

    index.sparse[lastId] = denseIdx;
    index.dense[denseIdx] = lastEntity;
    index.sparse[entityId] = lastIdx;
    index.dense[lastIdx] = deadEntry;
    index.aliveCount--;
};

export const isEntityAlive = /* @inline @pure */ (index: EntityIndex, entity: Entity): boolean => {
    const entityId = getEntityId(entity);
    const denseIdx = index.sparse[entityId];
    if (denseIdx === undefined || denseIdx >= index.aliveCount) return false;
    // Generation check is implicit: packed entity includes gen, so strict equality
    // catches stale handles with outdated generations.
    return index.dense[denseIdx] === entity;
};

export const getAliveEntities = (index: EntityIndex): Entity[] => {
    return index.dense.slice(0, index.aliveCount);
};

/** Release all pages owned by this entity index back to the allocator. */
export function releaseOwnedPages(index: EntityIndex): void {
    const allocator = index.allocator;
    for (const pageId of index.ownedPages) {
        allocator.pageAliveCounts[pageId] = 0;
        const gens = allocator.generations[pageId];
        if (gens) gens.fill(0);
        allocator.pageOwners[pageId] = null;
        allocator.freePages.push(pageId);
    }
    index.ownedPages.length = 0;
    index.pageCursors.length = 0;
    index.currentPageIdx = -1;
}
