import type { WorldContext } from '../world/types';
import { GENERATION_MASK, getEntityGeneration, getEntityId, packEntity, PAGE_SIZE } from './handle';
import { leasePage, releasePage } from './page-allocator';
import type { Entity, EntityIndex, PageAllocator } from './types';

export const createEntityIndex = (
  allocator: PageAllocator,
  owner: WorldContext,
  growTables: (owner: WorldContext, pageLimit: number) => void
): EntityIndex => ({
  aliveCount: 0,
  freeCount: 0,
  releases: 0,
  dense: [],
  sparse: [],
  ownedPages: [],
  pageCursors: [],
  currentPageIdx: -1,
  allocator,
  owner,
  growTables,
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
const allocateFreshEntity = (index: EntityIndex): Entity => {
  const entity = takeFreshId(index);
  enterAlive(index, entity, getEntityId(entity));
  return entity;
};

export const allocateEntity = (index: EntityIndex): Entity => {
  if (index.freeCount === 0) return allocateFreshEntity(index);
  index.freeCount--;
  return index.dense[index.aliveCount++];
};

/** Runs once per page of ids, so it stays out of the spawn path. */
function leaseNextPage(index: EntityIndex) {
  const pid = leasePage(index.allocator, index.owner);
  const owner = index.owner;
  if (pid >= owner.pageLimit) {
    owner.pageLimit = pid + 1;
    index.growTables(owner, owner.pageLimit);
  }
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
  index.releases++;
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

export /* @inline */ function assertEntityAlive(
  ctx: WorldContext | undefined | null,
  entity: Entity
): void {
  if (ctx === undefined || ctx === null) {
    throw createEntityNotAliveError(entity);
  }
  const index = ctx.entityIndex;
  const denseIdx = index.sparse[getEntityId(entity)];
  if (denseIdx === undefined || denseIdx >= index.aliveCount || index.dense[denseIdx] !== entity) {
    throw createEntityNotAliveError(entity);
  }
}

/**
 * The alive check for destroy and remove. A destroyed world passes, since destroying it already
 * destroyed its entities and the call then finds nothing to do. A dead entity of a live world
 * is a stale handle and still throws.
 */
export /* @inline */ function assertAliveOrWorldDestroyed(
  ctx: WorldContext | undefined | null,
  entity: Entity
): void {
  if (ctx === undefined || ctx === null) {
    throw createEntityNotAliveError(entity);
  }
  const index = ctx.entityIndex;
  const denseIdx = index.sparse[getEntityId(entity)];
  if (
    (denseIdx === undefined || denseIdx >= index.aliveCount || index.dense[denseIdx] !== entity) &&
    ctx.worldEntity !== null
  ) {
    throw createEntityNotAliveError(entity);
  }
}

// Variable bindings let the inlining plugin retain these cold dependencies.
export const createEntityNotAliveError = (entity: Entity): Error => {
  return new Error(
    `Koota: [ENTITY_ALIVE] The entity does not exist. It may have been destroyed. Entity ${entity}.`
  );
};
