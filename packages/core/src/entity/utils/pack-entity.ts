import type { RawEntity } from '../types';

// Entity packing: 8 bits generation + 24 bits entity ID = 32 bits
// No world ID bits — the handle carries the world reference.
export const GENERATION_BITS = 8; // 8 bits can represent 0-255
export const ENTITY_ID_BITS = 24; // 24 bits can represent 0-16,777,215

// Masks for extracting values
export const GENERATION_MASK = (1 << GENERATION_BITS) - 1;
export const ENTITY_ID_MASK = (1 << ENTITY_ID_BITS) - 1;

// Bit shifts for positioning each component
export const GENERATION_SHIFT = ENTITY_ID_BITS;

export function packEntity(generation: number, entityId: number): RawEntity {
    return (((generation & GENERATION_MASK) << GENERATION_SHIFT) |
        (entityId & ENTITY_ID_MASK)) as RawEntity;
}

export function unpackEntity(entity: RawEntity) {
    return {
        generation: (entity >>> GENERATION_SHIFT) & GENERATION_MASK,
        entityId: entity & ENTITY_ID_MASK,
    };
}

export const getEntityId = /* @inline @pure */ (entity: RawEntity) => entity & ENTITY_ID_MASK;
export const getEntityGeneration = /* @inline @pure */ (entity: RawEntity) =>
    (entity >>> GENERATION_SHIFT) & GENERATION_MASK;

export const incrementGeneration = (entity: RawEntity): RawEntity =>
    ((entity & ~(GENERATION_MASK << GENERATION_SHIFT)) |
        (((((entity >>> GENERATION_SHIFT) & GENERATION_MASK) + 1) & GENERATION_MASK) <<
            GENERATION_SHIFT)) as unknown as RawEntity;
