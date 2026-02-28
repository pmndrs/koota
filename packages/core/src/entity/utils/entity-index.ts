import type { Entity } from '../types';
import {
    getEntityGeneration,
    getEntityId,
    getEntityWorldId,
    incrementGeneration,
    packEntity,
} from './pack-entity';

export type EntityIndex = {
    /** The number of currently alive entities. */
    aliveCount: number;
    /** Array of packed entities, densely packed. */
    dense: Entity[];
    /** Sparse array mapping entity IDs to their index in the dense array. */
    sparse: number[];
    /** The highest entity ID that has been assigned. */
    maxId: number;
    /** The current world ID. */
    worldId: number;
    /** true when the dead portion needs re-sorting for block-aware recycling. */
    recycleDirty: boolean;
};

/**
 * Creates and initializes a new EntityIndex.
 * @param worldId - The ID of the world this index belongs to.
 * @returns A new EntityIndex object.
 */
export const createEntityIndex = (worldId: number): EntityIndex => ({
    aliveCount: 0,
    dense: [],
    sparse: [],
    maxId: 0,
    worldId,
    recycleDirty: false,
});

/**
 * Adds a new entity ID to the index or recycles an existing one.
 * block-aware: when recycling, prefers lower entity IDs so entities
 * cluster into partially-occupied blocks for better data locality.
 */
export const allocateEntity = (index: EntityIndex): Entity => {
    if (index.aliveCount < index.dense.length) {
        // sort the dead portion by entity ID (descending) so the lowest IDs
        // are at the end and get recycled first — this clusters entities into
        // lower-numbered blocks, improving cache locality after churn.
        if (index.recycleDirty) {
            const start = index.aliveCount;
            const end = index.dense.length;
            // sort descending so lowest ID is at the tail (popped first by swap)
            const deadSlice = index.dense.slice(start, end);
            deadSlice.sort((a, b) => getEntityId(b) - getEntityId(a));
            for (let i = 0; i < deadSlice.length; i++) {
                index.dense[start + i] = deadSlice[i];
                index.sparse[getEntityId(deadSlice[i])] = start + i;
            }
            index.recycleDirty = false;
        }

        // recycle entity — take from the end of the dead portion (lowest ID)
        const recycleIdx = index.dense.length - 1;
        const recycledEntity = incrementGeneration(index.dense[recycleIdx]);

        // swap recycled entity into the alive portion
        if (recycleIdx !== index.aliveCount) {
            const swapEntity = index.dense[index.aliveCount];
            index.dense[index.aliveCount] = recycledEntity;
            index.dense[recycleIdx] = swapEntity;
            index.sparse[getEntityId(recycledEntity)] = index.aliveCount;
            index.sparse[getEntityId(swapEntity)] = recycleIdx;
        } else {
            // only one dead entity — no swap needed, just update in place
            index.dense[index.aliveCount] = recycledEntity;
            index.sparse[getEntityId(recycledEntity)] = index.aliveCount;
        }
        index.aliveCount++;

        return recycledEntity;
    }
    // create new entity
    const id = index.maxId++;
    const entity = packEntity(index.worldId, 0, id);
    index.dense.push(entity);
    index.sparse[id] = index.aliveCount;
    index.aliveCount++;

    return entity;
};

/**
 * Removes an entity ID from the index.
 * marks the recycle pool as dirty so the next allocation re-sorts for block locality.
 */
export const releaseEntity = (index: EntityIndex, entity: Entity): void => {
    const id = getEntityId(entity);
    const denseIndex = index.sparse[id];
    if (denseIndex === undefined || denseIndex >= index.aliveCount) return;

    const lastIndex = index.aliveCount - 1;
    const lastEntity = index.dense[lastIndex];
    const lastId = getEntityId(lastEntity);

    // Swap with the last alive element
    index.sparse[lastId] = denseIndex;
    index.dense[denseIndex] = lastEntity;
    // Update the removed entity's record
    index.sparse[id] = lastIndex;
    index.dense[lastIndex] = entity;
    index.aliveCount--;
    index.recycleDirty = true;
};

/**
 * Checks if an entity ID is currently alive in the index.
 * @param index - The EntityIndex to check.
 * @param entity - The packed entity to check.
 * @returns True if the entity is alive, false otherwise.
 */
export const isEntityAlive = /* @inline @pure */ (index: EntityIndex, entity: Entity): boolean => {
    const denseIndex = index.sparse[getEntityId(entity)];
    if (denseIndex === undefined || denseIndex >= index.aliveCount) return false;
    const storedEntity = index.dense[denseIndex];
    return (
        getEntityGeneration(entity) === getEntityGeneration(storedEntity) &&
        getEntityWorldId(entity) === index.worldId
    );
};

/**
 * Gets an array of all currently alive entities.
 * @param index - The EntityIndex to get alive entities from.
 * @returns An array of alive entities.
 */
export const getAliveEntities = (index: EntityIndex): Entity[] => {
    return index.dense.slice(0, index.aliveCount);
};
