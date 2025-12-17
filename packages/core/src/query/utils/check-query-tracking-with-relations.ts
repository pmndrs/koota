import type { Entity } from '../../entity/types';
import { hasRelationPair } from '../../relation/relation';
import type { World } from '../../world/world';
import { checkQueryTracking } from './check-query-tracking';
import type { EventType, QueryInstance } from '../types';

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

	// Then check relation pairs if any
	if (query.relationFilters && query.relationFilters.length > 0) {
		for (const pair of query.relationFilters) {
			if (!hasRelationPair(world, entity, pair)) {
				return false;
			}
		}
	}

	return true;
}
