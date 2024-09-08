import { Entity } from '../types';

// Constants for bit sizes
export const WORLD_ID_BITS = 4; // 4 bits can represent 0-15
export const GENERATION_BITS = 8; // 8 bits can represent 0-255
export const ENTITY_ID_BITS = 20; // 20 bits can represent 0-1,048,575

// Total bits used: 4 + 8 + 20 = 32 bits

// Masks for extracting values
export const WORLD_ID_MASK = (1 << WORLD_ID_BITS) - 1;
export const GENERATION_MASK = (1 << GENERATION_BITS) - 1;
export const ENTITY_ID_MASK = (1 << ENTITY_ID_BITS) - 1;

// Bit shifts for positioning each component
const GENERATION_SHIFT = ENTITY_ID_BITS;

export function packEntity(worldId: number, generation: number, entityId: number): Entity {
	return (
		((worldId & WORLD_ID_MASK) << (GENERATION_BITS + ENTITY_ID_BITS)) |
		((generation & GENERATION_MASK) << ENTITY_ID_BITS) |
		(entityId & ENTITY_ID_MASK)
	);
}

export function unpackEntity(entity: Entity) {
	return {
		worldId: (entity >>> (GENERATION_BITS + ENTITY_ID_BITS)) & WORLD_ID_MASK,
		generation: (entity >>> ENTITY_ID_BITS) & GENERATION_MASK,
		entityId: entity & ENTITY_ID_MASK,
	};
}

export const getEntityId = (entity: Entity) => entity & ENTITY_ID_MASK;
export const getEntityGeneration = (entity: Entity) => (entity >>> GENERATION_SHIFT) & GENERATION_MASK; // prettier-ignore
export const getEntityWorldId = (entity: Entity) =>	(entity >>> (GENERATION_BITS + ENTITY_ID_BITS)) & WORLD_ID_MASK; // prettier-ignore

export const incrementGeneration = (entity: Entity) =>
	(entity & ~(GENERATION_MASK << GENERATION_SHIFT)) | // Clear current generation bits
	(((((entity >>> GENERATION_SHIFT) & GENERATION_MASK) + 1) & GENERATION_MASK) << GENERATION_SHIFT); // Extract generation, increment, wrap around, shift back, and combine
