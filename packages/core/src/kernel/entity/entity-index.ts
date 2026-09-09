import { prepareMembershipEntity } from './membership';
import type { KernelContext } from '../context';
import type { Entity } from './types';
import {
  GENERATION_MASK,
  MAX_PAGES,
  PAGE_SIZE,
  getEntityGeneration,
  getEntityId,
  packEntity,
} from './pack-entity';
import type { PageAllocator } from './page-allocator';
import { leasePage, releasePage } from './page-allocator';

export type EntityIndex = {
  /** The number of currently alive entities. */
  aliveCount: number;
  /** Dense list of alive packed entities. */
  dense: Entity[];
  /** Paged reverse index, storing dense row + 1. Zero means never allocated. */
  sparse: (Int32Array | undefined)[];
  reserved: Set<Entity>;
  /** Dense list of leased page IDs. */
  ownedPages: number[];
  /** Per-page cursor: next fresh offset to allocate from (parallel to ownedPages). */
  pageCursors: number[];
  /** Index into ownedPages of the page we're currently filling. */
  currentPageIdx: number;
  /** Reference to the global page allocator. */
  allocator: PageAllocator;
  /** The owning KernelContext (for page leasing). */
  owner: KernelContext;
};

export function createEntityIndex(allocator: PageAllocator, owner: KernelContext): EntityIndex {
  const sparse: (Int32Array | undefined)[] = [];
  for (let i = 0; i < MAX_PAGES; i++) sparse[i] = undefined;
  return {
    aliveCount: 0,
    dense: [],
    sparse,
    reserved: new Set(),
    ownedPages: [],
    pageCursors: [],
    currentPageIdx: -1,
    allocator,
    owner,
  };
}

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
    entity = allocateFreshEntity(index);
    entityId = getEntityId(entity);
  }

  allocator.pageAliveCounts[entityId >>> 10]++;
  allocator.slots[entityId >>> 10]![entityId & 1023] = getEntityGeneration(entity) | 256;

  const denseIdx = index.aliveCount;
  const sparsePage = (index.sparse[entityId >>> 10] ??= new Int32Array(PAGE_SIZE));
  sparsePage[entityId & 1023] = denseIdx + 1;
  if (denseIdx < index.dense.length) {
    index.dense[denseIdx] = entity;
  } else {
    index.dense.push(entity);
  }
  index.aliveCount++;
  index.owner.memberships.version++;

  prepareEntityStorage(index, entity);
  return entity;
};

/** Reserve an identity without publishing an entity or allocating trait storage. */
export function reserveEntity(index: EntityIndex): Entity {
  let entity: Entity;
  if (index.aliveCount < index.dense.length) {
    entity = index.dense[index.aliveCount];
    const last = index.dense.pop()!;
    if (index.aliveCount < index.dense.length) index.dense[index.aliveCount] = last;
  } else entity = allocateFreshEntity(index);
  index.reserved.add(entity);
  index.allocator.pageAliveCounts[getEntityId(entity) >>> 10]++;
  prepareEntityStorage(index, entity);
  return entity;
}

export function activateReservedEntity(index: EntityIndex, entity: Entity): Entity {
  if (!index.reserved.delete(entity))
    throw new Error('Koota: Entity reservation is no longer valid.');
  if (index.aliveCount < index.dense.length) index.dense.push(index.dense[index.aliveCount]);
  index.dense[index.aliveCount] = entity;
  const entityId = getEntityId(entity);
  index.allocator.slots[entityId >>> 10]![entityId & 1023] = getEntityGeneration(entity) | 256;
  const sparsePage = (index.sparse[entityId >>> 10] ??= new Int32Array(PAGE_SIZE));
  sparsePage[entityId & 1023] = ++index.aliveCount;
  index.owner.memberships.version++;
  prepareEntityStorage(index, entity);
  return entity;
}

export function cancelReservedEntity(index: EntityIndex, entity: Entity): void {
  if (!index.reserved.delete(entity)) return;
  const entityId = getEntityId(entity);
  const pageId = entityId >>> 10;
  const generation = getEntityGeneration(entity) + 1;
  index.allocator.slots[pageId]![entityId & 1023] = generation > GENERATION_MASK ? 512 : generation;
  index.allocator.pageAliveCounts[pageId]--;
  if (generation <= GENERATION_MASK) index.dense.push(packEntity(generation, entityId));
}

export const releaseEntity = (index: EntityIndex, entity: Entity): void => {
  const entityId = getEntityId(entity);
  const sparsePage = index.sparse[entityId >>> 10];
  const denseIdx = sparsePage ? sparsePage[entityId & 1023] - 1 : -1;
  if (denseIdx < 0 || denseIdx >= index.aliveCount || index.dense[denseIdx] !== entity) return;

  const allocator = index.allocator;
  const pageId = entityId >>> 10;
  const offset = entityId & 1023;

  allocator.pageAliveCounts[pageId]--;

  // Bump generation and persist to both dense (for fast recycle) and TypedArray (for page re-lease safety).
  const nextGen = getEntityGeneration(entity) + 1;
  allocator.slots[pageId]![offset] = nextGen > GENERATION_MASK ? 512 : nextGen;
  const deadEntry = packEntity(nextGen, entityId);

  // Swap with last alive in dense array.
  const lastIdx = index.aliveCount - 1;
  const lastEntity = index.dense[lastIdx];
  const lastId = getEntityId(lastEntity);

  index.sparse[lastId >>> 10]![lastId & 1023] = denseIdx + 1;
  index.dense[denseIdx] = lastEntity;
  sparsePage![entityId & 1023] = lastIdx + 1;
  index.dense[lastIdx] = deadEntry;
  index.aliveCount--;
  index.owner.memberships.version++;
  if (nextGen > GENERATION_MASK) {
    const last = index.dense.pop()!;
    if (lastIdx < index.dense.length) index.dense[lastIdx] = last;
    sparsePage![entityId & 1023] = 0;
  }
};

export const isEntityAlive = /* @inline @pure */ (index: EntityIndex, entity: Entity): boolean => {
  if (entity !== (entity & 0x3fffffff)) return false;
  const entityId = getEntityId(entity);
  const pageId = entityId >>> 10;
  const allocator = index.allocator;
  return (
    allocator.pageOwners[pageId] === index.owner &&
    allocator.slots[pageId]![entityId & 1023] === (getEntityGeneration(entity) | 256)
  );
};

export const getAliveEntities = (index: EntityIndex): Entity[] => {
  return index.dense.slice(0, index.aliveCount);
};

/** Release all pages owned by this entity index back to the allocator. */
export function releaseOwnedPages(index: EntityIndex): void {
  const allocator = index.allocator;
  for (const pageId of index.ownedPages) {
    if (allocator.pageOwners[pageId] === index.owner) releasePage(allocator, pageId);
  }
  index.ownedPages.length = 0;
  index.pageCursors.length = 0;
  index.currentPageIdx = -1;
}

/** Exhausted generation slots retire permanently instead of aliasing stale handles. */
function allocateFreshEntity(index: EntityIndex): Entity {
  for (;;) {
    if (index.currentPageIdx === -1 || index.pageCursors[index.currentPageIdx] >= PAGE_SIZE) {
      const page = leasePage(index.allocator, index.owner);
      index.ownedPages.push(page);
      index.pageCursors.push(0);
      index.currentPageIdx = index.ownedPages.length - 1;
    }
    const page = index.ownedPages[index.currentPageIdx];
    const offset = index.pageCursors[index.currentPageIdx]++;
    const generation = index.allocator.slots[page]![offset];
    if (generation <= GENERATION_MASK) return packEntity(generation, page * PAGE_SIZE + offset);
  }
}

/** Creation and reservation share membership pages and the destruction workspace. */
function prepareEntityStorage(index: EntityIndex, entity: Entity): void {
  prepareMembershipEntity(index.owner.memberships, entity);
  const queue = index.owner.destroyQueue;
  if (queue.length < index.aliveCount + index.reserved.size) {
    const size = Math.max(256, queue.length * 2);
    while (queue.length < size) queue.push(0);
  }
}
