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
import { leasePage, releasePage } from './page-allocator';
import { getPageLimit, growPageTables } from './paged-mask';

export type EntityIndex = {
  /** The number of currently alive entities. */
  aliveCount: number;
  /** Reusable entries immediately after the alive region. Retained entries follow them. */
  freeCount: number;
  /** Counts every entity that left the alive region. Removal history reads it as a clock. */
  releases: number;
  /** Moves on every handle release and deferred query removal, so walks know to re-check rows. */
  revision: number;
  /**
   * Packed entities in three regions: alive, reusable, retained. Eviction bumps the generation
   * before moving a retained entry into the reusable region.
   */
  dense: Entity[];
  /** Sparse: entityId -> index in dense (or undefined). */
  sparse: number[];
  /** Dense list of leased page IDs. */
  ownedPages: number[];
  /** Per-page cursor: next fresh offset to allocate from (parallel to ownedPages). */
  pageCursors: number[];
  /** Index into ownedPages of the page we're currently filling. */
  currentPageIdx: number;
  /** The world's own allocator, or the one worlds with entity methods share. */
  allocator: PageAllocator;
  /** The owning WorldContext (for page leasing). */
  owner: WorldContext;
};

export const createEntityIndex = (allocator: PageAllocator, owner: WorldContext): EntityIndex => ({
  aliveCount: 0,
  freeCount: 0,
  releases: 0,
  revision: 0,
  dense: [],
  sparse: [],
  ownedPages: [],
  pageCursors: [],
  currentPageIdx: -1,
  allocator,
  owner,
});

/** Place an allocated entity at the alive boundary, moving whatever free entry sat there to the end. */
function enterAlive(index: EntityIndex, entity: Entity, entityId: number) {
  const denseIdx = index.aliveCount;
  if (denseIdx < index.dense.length) {
    const displaced = index.dense[denseIdx];
    index.dense.push(displaced);
    index.sparse[getEntityId(displaced)] = index.dense.length - 1;
    index.dense[denseIdx] = entity;
  } else {
    index.dense.push(entity);
  }
  index.sparse[entityId] = denseIdx;
  index.aliveCount++;
}

/** A fresh id from the page cursor. */
export const allocateFreshEntity = (index: EntityIndex): Entity => {
  if (assertsEnabled) index.owner.structuralRevision++;
  const entity = takeFreshId(index);
  enterAlive(index, entity, getEntityId(entity));
  return entity;
};

export const allocateEntity = (index: EntityIndex): Entity => {
  if (index.freeCount === 0) return allocateFreshEntity(index);
  if (assertsEnabled) index.owner.structuralRevision++;
  index.freeCount--;
  return index.dense[index.aliveCount++];
};

/** Runs once per page of ids, so it stays out of the spawn path. */
function leaseNextPage(index: EntityIndex) {
  const pid = leasePage(index.allocator, index.owner);
  if (pid >= getPageLimit(index.owner)) growPageTables(index.owner, pid + 1);
  index.ownedPages.push(pid);
  index.pageCursors.push(0);
  index.currentPageIdx = index.ownedPages.length - 1;
}

/** The next id on the current page, leasing a page when it is full. */
function takeFreshId(index: EntityIndex): Entity {
  const allocator = index.allocator;
  if (index.currentPageIdx === -1 || index.pageCursors[index.currentPageIdx] >= PAGE_SIZE) {
    leaseNextPage(index);
  }
  const pid = index.ownedPages[index.currentPageIdx];
  const offset = index.pageCursors[index.currentPageIdx]++;
  const entityId = pid * PAGE_SIZE + offset;
  // The generation comes from the page, so a re-leased page continues from where it left off.
  return packEntity(allocator.generations[entityId >>> 10]![offset], entityId);
}

/** Move the entity after the reusable region, keeping it readable until eviction. */
export const freeEntity = (index: EntityIndex, entity: Entity): void => {
  const entityId = getEntityId(entity);
  const denseIdx = index.sparse[entityId];
  if (denseIdx === undefined || denseIdx >= index.aliveCount) return;
  if (assertsEnabled) index.owner.structuralRevision++;
  index.releases++;
  index.revision++;
  const lastIdx = index.aliveCount - 1;
  const lastEntity = index.dense[lastIdx];
  index.sparse[getEntityId(lastEntity)] = denseIdx;
  index.dense[denseIdx] = lastEntity;
  const retainedIdx = lastIdx + index.freeCount;
  if (retainedIdx !== lastIdx) {
    const displaced = index.dense[retainedIdx];
    index.dense[lastIdx] = displaced;
    index.sparse[getEntityId(displaced)] = lastIdx;
  }
  index.sparse[entityId] = retainedIdx;
  index.dense[retainedIdx] = entity;
  index.aliveCount--;
};

/** Invalidate an evicted handle and put its slot at the end of the reusable region. */
export const releaseRetainedEntity = (index: EntityIndex, entity: Entity): void => {
  if (assertsEnabled) index.owner.structuralRevision++;
  const entityId = getEntityId(entity);
  const denseIdx = index.sparse[entityId];
  const firstIdx = index.aliveCount + index.freeCount;
  const first = index.dense[firstIdx];
  index.sparse[getEntityId(first)] = denseIdx;
  index.dense[denseIdx] = first;

  const nextGen = (getEntityGeneration(entity) + 1) & GENERATION_MASK;
  index.allocator.generations[entityId >>> 10]![entityId & 1023] = nextGen;
  const fresh = packEntity(nextGen, entityId);
  index.dense[firstIdx] = fresh;
  index.sparse[entityId] = firstIdx;
  index.freeCount++;
};

export const isEntityReadable = /* @inline @pure */ (index: EntityIndex, entity: Entity): boolean => {
  const position = index.sparse[getEntityId(entity)];
  return (
    index.dense[position] === entity &&
    (position < index.aliveCount || position >= index.aliveCount + index.freeCount)
  );
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

/**
 * Release all pages owned by this entity index back to the allocator, last page first, so a
 * world that owns its allocator leases them again from the first page up.
 */
export function releaseOwnedPages(index: EntityIndex): void {
  for (let i = index.ownedPages.length - 1; i >= 0; i--) {
    releasePage(index.allocator, index.ownedPages[i]);
  }
  index.ownedPages.length = 0;
  index.pageCursors.length = 0;
  index.currentPageIdx = -1;
}
