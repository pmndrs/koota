import type { Entity } from '../types';

export const ENTITY_ID_BITS = 20;
export const GENERATION_BITS = 12;

export const ENTITY_ID_MASK = (1 << ENTITY_ID_BITS) - 1; // 0xFFFFF
export const GENERATION_MASK = (1 << GENERATION_BITS) - 1; // 0xFFF
export const GENERATION_SHIFT = ENTITY_ID_BITS;

export const PAGE_BITS = 10;
export const PAGE_SIZE = 1 << PAGE_BITS; // 1024
export const PAGE_MASK = PAGE_SIZE - 1; // 1023
export const MAX_PAGES = 1 << (ENTITY_ID_BITS - PAGE_BITS); // 1024

export function packEntity(generation: number, entityId: number): Entity {
	return (((generation & GENERATION_MASK) << GENERATION_SHIFT) |
		(entityId & ENTITY_ID_MASK)) as Entity;
}

export function unpackEntity(entity: Entity) {
	return {
		generation: (entity >>> GENERATION_SHIFT) & GENERATION_MASK,
		entityId: entity & ENTITY_ID_MASK,
	};
}

export const getEntityId = /* @inline @pure */ (entity: Entity) => entity & ENTITY_ID_MASK;

export const getEntityGeneration = /* @inline @pure */ (entity: Entity) =>
	(entity >>> GENERATION_SHIFT) & GENERATION_MASK;

export const incrementGeneration = (entity: Entity): Entity =>
	((entity & ~(GENERATION_MASK << GENERATION_SHIFT)) |
		(((((entity >>> GENERATION_SHIFT) & GENERATION_MASK) + 1) & GENERATION_MASK) <<
			GENERATION_SHIFT)) as unknown as Entity;
