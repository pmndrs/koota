import type { WorldInternal } from '../../world/types';
import type { Entity } from '../types';
import type { PageAllocator } from './page-allocator';
import { ctz32, leasePage } from './page-allocator';
import {
	GENERATION_MASK,
	GENERATION_SHIFT,
	PAGE_SIZE,
	getEntityGeneration,
	getEntityId,
	packEntity,
} from './pack-entity';

export type EntityIndex = {
	/** The number of currently alive entities. */
	aliveCount: number;
	/** Dense list of alive packed entities. */
	dense: Entity[];
	/** Sparse: entityId -> index in dense (or undefined). */
	sparse: number[];
	/** Dense list of leased page IDs. */
	ownedPages: number[];
	/** Index into ownedPages of the page we're currently allocating from. */
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
	currentPageIdx: -1,
	allocator,
	owner,
});

export const allocateEntity = (index: EntityIndex): Entity => {
	const allocator = index.allocator;
	let pageId = -1;
	let offset = -1;

	// Try to find a free slot in an owned page, starting from currentPageIdx.
	for (let i = index.ownedPages.length - 1; i >= 0; i--) {
		const pid = index.ownedPages[i];
		const alive = allocator.alive[pid]!;
		const freeOffset = findFreeSlot(alive);
		if (freeOffset !== -1) {
			pageId = pid;
			offset = freeOffset;
			index.currentPageIdx = i;
			break;
		}
	}

	// No free slot found -- lease a new page.
	if (pageId === -1) {
		pageId = leasePage(allocator, index.owner);
		index.ownedPages.push(pageId);
		index.currentPageIdx = index.ownedPages.length - 1;
		offset = 0;
	}

	// Set alive bit.
	const wordIdx = offset >>> 5;
	const bitIdx = offset & 31;
	allocator.alive[pageId]![wordIdx] |= 1 << bitIdx;

	const entityId = pageId * PAGE_SIZE + offset;
	const gen = allocator.generations[pageId]![offset];
	const entity = packEntity(gen, entityId);

	// Add to dense/sparse.
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

	// Clear alive bit.
	const wordIdx = offset >>> 5;
	allocator.alive[pageId]![wordIdx] &= ~(1 << (offset & 31));

	// Bump generation for recycling.
	allocator.generations[pageId]![offset] =
		(allocator.generations[pageId]![offset] + 1) & GENERATION_MASK;

	// Swap with last alive in dense array.
	const lastIdx = index.aliveCount - 1;
	const lastEntity = index.dense[lastIdx];
	const lastId = getEntityId(lastEntity);

	index.sparse[lastId] = denseIdx;
	index.dense[denseIdx] = lastEntity;
	index.sparse[entityId] = lastIdx;
	index.dense[lastIdx] = entity;
	index.aliveCount--;
};

export const isEntityAlive = /* @inline @pure */ (index: EntityIndex, entity: Entity): boolean => {
	const entityId = getEntityId(entity);
	const pageId = entityId >>> 10;
	const offset = entityId & 1023;

	const aliveBits = index.allocator.alive[pageId];
	if (!aliveBits) return false;
	if ((aliveBits[offset >>> 5] & (1 << (offset & 31))) === 0) return false;

	return getEntityGeneration(entity) === index.allocator.generations[pageId]![offset];
};

export const getAliveEntities = (index: EntityIndex): Entity[] => {
	return index.dense.slice(0, index.aliveCount);
};

/** Release all pages owned by this entity index back to the allocator. */
export function releaseOwnedPages(index: EntityIndex): void {
	const allocator = index.allocator;
	for (const pageId of index.ownedPages) {
		const alive = allocator.alive[pageId];
		if (alive) alive.fill(0);
		const gens = allocator.generations[pageId];
		if (gens) gens.fill(0);
		allocator.pageOwners[pageId] = null;
		allocator.freePages.push(pageId);
	}
	index.ownedPages.length = 0;
	index.currentPageIdx = -1;
}

/** Find the first free slot in a page's alive bitset. Returns offset (0-1023) or -1. */
function findFreeSlot(alive: Uint32Array): number {
	const words = alive.length; // PAGE_SIZE / 32 = 32
	for (let w = 0; w < words; w++) {
		const word = alive[w];
		if (word !== 0xffffffff) {
			const bit = ctz32(~word);
			return (w << 5) | bit;
		}
	}
	return -1;
}
