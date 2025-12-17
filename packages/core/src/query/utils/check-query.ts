import { $internal } from '../../common';
import type { Entity } from '../../entity/types';
import { getEntityId } from '../../entity/utils/pack-entity';
import type { World } from '../../world';
import type { QueryInstance } from '../types';

/**
 * Check if an entity matches a non-tracking query.
 * For tracking queries, use checkQueryTracking instead.
 */
export function checkQuery(world: World, query: QueryInstance, entity: Entity): boolean {
	const { bitmasks, generations } = query;
	const ctx = world[$internal];
	const eid = getEntityId(entity);

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
