import type { Entity } from '../../entity/types';
import { $internal } from '../../common';
import type { World } from '../../world/world';
import type { Query } from '../types';

/**
 * Check if an entity matches a non-tracking query.
 * For tracking queries, use checkQueryTracking instead.
 */
export function checkQuery(world: World, query: Query, entity: Entity): boolean {
	const { bitmasks, generations } = query;
	const ctx = world[$internal];
	const eid = entity & 0xfffff; // ENTITY_ID_MASK

	if (query.traitData.all.length === 0) return false;

	for (let i = 0; i < generations.length; i++) {
		const generationId = generations[i];
		const bitmask = bitmasks[i];
		const { required, forbidden, or } = bitmask;
		const entityMask = ctx.entityMasks[generationId][eid];

		if (!forbidden && !required && !or) return false;
		if ((entityMask & forbidden) !== 0) return false;
		if ((entityMask & required) !== required) return false;
		if (or !== 0 && (entityMask & or) === 0) return false;
	}

	return true;
}

