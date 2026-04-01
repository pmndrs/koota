import type { RawEntity } from '../types';
import {
    getEntityGeneration,
    getEntityId,
    incrementGeneration,
    packEntity,
} from './pack-entity';

export type EntityIndex = {
    /** The number of currently alive entities. */
    aliveCount: number;
    /** Array of packed entities, densely packed. */
    dense: RawEntity[];
    /** Sparse array mapping entity IDs to their index in the dense array. */
    sparse: number[];
    /** The highest entity ID that has been assigned. */
    maxId: number;
};

export const createEntityIndex = (): EntityIndex => ({
    aliveCount: 0,
    dense: [],
    sparse: [],
    maxId: 0,
});

export const allocateEntity = (index: EntityIndex): RawEntity => {
    if (index.aliveCount < index.dense.length) {
        // Recycle entity
        const recycledEntity = incrementGeneration(index.dense[index.aliveCount]);
        index.dense[index.aliveCount] = recycledEntity;
        index.sparse[getEntityId(recycledEntity)] = index.aliveCount;
        index.aliveCount++;

        return recycledEntity;
    }
    // Create new entity
    const id = index.maxId++;
    const entity = packEntity(0, id);
    index.dense.push(entity);
    index.sparse[id] = index.aliveCount;
    index.aliveCount++;

    return entity;
};

export const releaseEntity = (index: EntityIndex, entity: RawEntity): void => {
    const id = getEntityId(entity);
    const denseIndex = index.sparse[id];
    if (denseIndex === undefined || denseIndex >= index.aliveCount) return;

    const lastIndex = index.aliveCount - 1;
    const lastEntity = index.dense[lastIndex];
    const lastId = getEntityId(lastEntity);

    // Swap with the last element
    index.sparse[lastId] = denseIndex;
    index.dense[denseIndex] = lastEntity;
    // Update the removed entity's record
    index.sparse[id] = lastIndex;
    index.dense[lastIndex] = entity;
    index.aliveCount--;
};

export const isEntityAlive = /* @inline @pure */ (index: EntityIndex, entity: RawEntity): boolean => {
    const denseIndex = index.sparse[getEntityId(entity)];
    if (denseIndex === undefined || denseIndex >= index.aliveCount) return false;
    const storedEntity = index.dense[denseIndex];
    return getEntityGeneration(entity) === getEntityGeneration(storedEntity);
};

export const getAliveEntities = (index: EntityIndex): RawEntity[] => {
    return index.dense.slice(0, index.aliveCount);
};
