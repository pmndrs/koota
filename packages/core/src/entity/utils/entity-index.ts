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
  /** Counts every entity that left the alive region, so a walk can tell whether any died. */
  releases: number;
  /**
   * Dense list of packed entities, alive first. A free slot keeps the handle of the entity that
   * died there, so it stays readable until the id is reused and the generation is bumped.
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
  /** Reference to the global page allocator. */
  allocator: PageAllocator;
  /** The owning WorldContext (for page leasing). */
  owner: WorldContext;
  /** Free slots keep readable handles. False on a world that bumps generations at destroy. */
  readableFree: boolean;
};

export const createEntityIndex = (allocator: PageAllocator, owner: WorldContext): EntityIndex => ({
  aliveCount: 0,
  releases: 0,
  dense: [],
  sparse: [],
  ownedPages: [],
  pageCursors: [],
  currentPageIdx: -1,
  allocator,
  owner,
  readableFree: owner.retain !== 0,
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

/** The next id on the current page, leasing a page when it is full. The page counts it as held. */
function takeFreshId(index: EntityIndex): Entity {
  const allocator = index.allocator;
  if (index.currentPageIdx === -1 || index.pageCursors[index.currentPageIdx] >= PAGE_SIZE) {
    const pid = leasePage(allocator, index.owner);
    index.ownedPages.push(pid);
    index.pageCursors.push(0);
    index.currentPageIdx = index.ownedPages.length - 1;
  }
  const pid = index.ownedPages[index.currentPageIdx];
  const offset = index.pageCursors[index.currentPageIdx]++;
  const entityId = pid * PAGE_SIZE + offset;
  // The generation comes from the page, so a re-leased page continues from where it left off.
  const entity = packEntity(allocator.generations[entityId >>> 10]![offset], entityId);
  allocator.pageAliveCounts[entityId >>> 10]++;
  return entity;
}

/**
 * Strict allocation for a world that retains nothing: the newest released id, which already
 * carries its bumped generation, else a fresh one.
 */
export const allocateEntity = (index: EntityIndex): Entity => {
  if (index.aliveCount === index.dense.length) return allocateFreshEntity(index);
  if (assertsEnabled) index.owner.structuralRevision++;
  const entity = index.dense[index.aliveCount];
  const entityId = getEntityId(entity);
  index.allocator.pageAliveCounts[entityId >>> 10]++;
  index.sparse[entityId] = index.aliveCount;
  index.aliveCount++;
  return entity;
};

/** Swap the entity out of the alive region. */
function leaveAlive(index: EntityIndex, entityId: number, denseIdx: number, entry: Entity) {
  index.releases++;
  const lastIdx = index.aliveCount - 1;
  const lastEntity = index.dense[lastIdx];
  index.sparse[getEntityId(lastEntity)] = denseIdx;
  index.dense[denseIdx] = lastEntity;
  index.sparse[entityId] = lastIdx;
  index.dense[lastIdx] = entry;
  index.aliveCount--;
}

/** Strict release: the generation is bumped at once, so the handle stops resolving. */
export const releaseEntity = (index: EntityIndex, entity: Entity): void => {
  const entityId = getEntityId(entity);
  const denseIdx = index.sparse[entityId];
  if (denseIdx === undefined || denseIdx >= index.aliveCount) return;

  if (assertsEnabled) index.owner.structuralRevision++;
  const allocator = index.allocator;
  const pageId = entityId >>> 10;
  allocator.pageAliveCounts[pageId]--;
  const nextGen = (getEntityGeneration(entity) + 1) & GENERATION_MASK;
  allocator.generations[pageId]![entityId & 1023] = nextGen;
  leaveAlive(index, entityId, denseIdx, packEntity(nextGen, entityId));
};

/**
 * Free the entity without bumping its generation. The handle keeps resolving to its slot, so
 * the data stays readable, until reuseEntity hands the id out again.
 */
export const freeEntity = (index: EntityIndex, entity: Entity): void => {
  const entityId = getEntityId(entity);
  const denseIdx = index.sparse[entityId];
  if (denseIdx === undefined || denseIdx >= index.aliveCount) return;
  if (assertsEnabled) index.owner.structuralRevision++;
  leaveAlive(index, entityId, denseIdx, entity);
};

/** Reuse a freed id. The generation is bumped here, so the old handle stops resolving. */
export const reuseEntity = (index: EntityIndex, entity: Entity): Entity => {
  if (assertsEnabled) index.owner.structuralRevision++;
  const entityId = getEntityId(entity);
  const denseIdx = index.sparse[entityId];
  const firstIdx = index.aliveCount;
  const first = index.dense[firstIdx];
  index.sparse[getEntityId(first)] = denseIdx;
  index.dense[denseIdx] = first;

  const nextGen = (getEntityGeneration(entity) + 1) & GENERATION_MASK;
  index.allocator.generations[entityId >>> 10]![entityId & 1023] = nextGen;
  const fresh = packEntity(nextGen, entityId);
  index.dense[firstIdx] = fresh;
  index.sparse[entityId] = firstIdx;
  index.aliveCount++;
  return fresh;
};

/** Alive, or destroyed with an id not yet reused on a world that keeps destroyed entities. */
export const isEntityReadable = (index: EntityIndex, entity: Entity): boolean => {
  const denseIdx = index.sparse[getEntityId(entity)];
  if (denseIdx === undefined || index.dense[denseIdx] !== entity) return false;
  return denseIdx < index.aliveCount || index.readableFree;
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
