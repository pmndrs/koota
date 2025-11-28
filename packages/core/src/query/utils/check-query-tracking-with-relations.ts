import type { Entity } from '../../entity/types';
import type { World } from '../../world/world';
import { checkQueryTracking } from './check-query-tracking';
import { checkRelationFilter } from './check-relation-filter';
import type { EventType, Query } from '../types';

/**
 * Check if an entity matches a tracking query with relation filters.
 * Combines checkQueryTracking (trait bitmasks + tracking state) with relation checks.
 */
export function checkQueryTrackingWithRelations(
	world: World,
	query: Query,
	entity: Entity,
	eventType: EventType,
	eventGenerationId: number,
	eventBitflag: number
): boolean {
	// First check trait bitmasks and tracking state (fast)
	if (!checkQueryTracking(world, query, entity, eventType, eventGenerationId, eventBitflag)) {
		return false;
	}

	// Then check relation filters if any
	if (query.relationFilters && query.relationFilters.length > 0) {
		for (const filter of query.relationFilters) {
			if (!checkRelationFilter(world, entity, filter)) {
				return false;
			}
		}
	}

	return true;
}
