import type { Entity } from '../../entity/types';
import type { World } from '../../world/world';
import { checkQuery } from './check-query';
import { checkRelationFilter } from './check-relation-filter';
import type { Query } from '../types';

/**
 * Check if an entity matches a query with relation filters.
 * Uses hybrid bitmask strategy: trait bitmasks first (fast), then relation checks.
 */
export function checkQueryWithRelations(world: World, query: Query, entity: Entity): boolean {
	// First check trait bitmasks (fast)
	if (!checkQuery(world, query, entity)) return false;

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
