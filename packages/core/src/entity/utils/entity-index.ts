import type { WorldContext } from '../../world/types';
import { assertsEnabled } from '../../assert-config';
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
  /** Counts every release, so a walk can tell whether any entity died since it started. */
  releases: number;
  /** Destroyed entities kept readable until the world collects. They follow the alive ones in dense. */
  retainedCount: number;
  /** Dense list of packed entities. Alive first, then retained, then free slots with bumped generations. */
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
  /** The owning WorldContext (for page leasing). */
  owner: WorldContext;
};

export const createEntityIndex = (allocator: PageAllocator, owner: WorldContext): EntityIndex => ({
  aliveCount: 0,
  releases: 0,
  retainedCount: 0,
  dense: [],
  sparse: [],
  ownedPages: [],
  pageCursors: [],
  currentPageIdx: -1,
  allocator,
  owner,
});

export const allocateEntity = (index: EntityIndex): Entity => {
  if (assertsEnabled) index.owner.structuralRevision++;
  const allocator = index.allocator;
  let entity: Entity;
  let entityId: number;

  const free = index.aliveCount + index.retainedCount;
  if (free < index.dense.length) {
    // Recycle: the first free slot already holds the pre-packed entity with its bumped generation
    // (written on release). No TypedArray reads needed.
    entity = index.dense[free];
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
  if (index.retainedCount !== 0) {
    // The slot after the alive ones holds a retained entity. It moves to the slot the new entity
    // would otherwise take so the retained region stays contiguous.
    const displaced = index.dense[denseIdx];
    if (free < index.dense.length) index.dense[free] = displaced;
    else index.dense.push(displaced);
    index.sparse[getEntityId(displaced)] = free;
    index.dense[denseIdx] = entity;
  } else if (denseIdx < index.dense.length) {
    index.dense[denseIdx] = entity;
  } else {
    index.dense.push(entity);
  }
  index.sparse[entityId] = denseIdx;
  index.aliveCount++;

  return entity;
};

export const releaseEntity = (index: EntityIndex, entity: Entity): void => {
  const entityId = getEntityId(entity);
  const denseIdx = index.sparse[entityId];
  if (denseIdx === undefined || denseIdx >= index.aliveCount) return;

  if (assertsEnabled) index.owner.structuralRevision++;
  index.releases++;
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

/**
 * Move a destroyed entity into the retained region without bumping its generation, so the handle
 * still resolves for readers until the world collects.
 */
export const retainEntity = (index: EntityIndex, entity: Entity): void => {
  const entityId = getEntityId(entity);
  const denseIdx = index.sparse[entityId];
  if (denseIdx === undefined || denseIdx >= index.aliveCount) return;

  if (assertsEnabled) index.owner.structuralRevision++;

  const lastIdx = index.aliveCount - 1;
  const lastEntity = index.dense[lastIdx];
  index.sparse[getEntityId(lastEntity)] = denseIdx;
  index.dense[denseIdx] = lastEntity;
  index.sparse[entityId] = lastIdx;
  index.dense[lastIdx] = entity;
  index.aliveCount--;
  index.retainedCount++;
};

/** Release every retained entity. Their ids become free with bumped generations. */
export const collectRetainedEntities = (index: EntityIndex): void => {
  const { dense, aliveCount, retainedCount } = index;
  if (retainedCount === 0) return;
  if (assertsEnabled) index.owner.structuralRevision++;
  const allocator = index.allocator;
  for (let i = aliveCount; i < aliveCount + retainedCount; i++) {
    const entity = dense[i];
    const entityId = getEntityId(entity);
    const nextGen = (getEntityGeneration(entity) + 1) & GENERATION_MASK;
    allocator.generations[entityId >>> 10]![entityId & 1023] = nextGen;
    allocator.pageAliveCounts[entityId >>> 10]--;
    dense[i] = packEntity(nextGen, entityId);
  }
  index.retainedCount = 0;
};

export const isEntityRetained = (index: EntityIndex, entity: Entity): boolean => {
  const denseIdx = index.sparse[getEntityId(entity)];
  if (denseIdx === undefined || denseIdx < index.aliveCount) return false;
  if (denseIdx >= index.aliveCount + index.retainedCount) return false;
  return index.dense[denseIdx] === entity;
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
    // Preserve bumped generations so old handles stay invalid when a page is leased again.
    allocator.pageOwners[pageId] = null;
    allocator.freePages.push(pageId);
  }
  index.ownedPages.length = 0;
  index.pageCursors.length = 0;
  index.currentPageIdx = -1;
}
