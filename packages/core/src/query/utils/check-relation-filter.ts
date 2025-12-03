import { $internal } from '../../common';
import type { Entity } from '../../entity/types';
import { hasRelationToTarget } from '../../relation/relation';
import type { Relation, RelationTarget } from '../../relation/types';
import { hasTrait } from '../../trait/trait';
import type { World } from '../../world/world';

/** Filter for checking relation targets */
export interface RelationFilter {
	relation: Relation<any>;
	target: RelationTarget;
}

/**
 * Check if an entity matches a relation filter.
 * Uses hybrid bitmask strategy: fast bitwise check before target lookup.
 */
export function checkRelationFilter(
	world: World,
	entity: Entity,
	{ relation, target }: RelationFilter
): boolean {
	// First check if entity has the base trait bitflag
	if (!hasTrait(world, entity, relation[$internal].trait)) return false;
	// Wildcard target
	if (target === '*') return true;
	// Specific target
	if (typeof target === 'number') return hasRelationToTarget(world, relation, entity, target);

	return false;
}
