import type { Entity } from '../../entity/types';
import { hasRelationToTarget } from '../../relation/relation';
import type { Relation, RelationTarget } from '../../relation/types';
import { $internal } from '../../common';
import type { World } from '../../world/world';
import { getTraitData } from '../../trait/utils/trait-data';

/** Filter for checking relation targets */
export interface RelationFilter {
	relation: Relation<any>;
	target: RelationTarget;
}

/**
 * Check if an entity matches a relation filter.
 * Uses hybrid bitmask strategy: fast bitwise check before target lookup.
 * @inline - Inlined at call sites for performance
 */
/* @inline */ export function checkRelationFilter(
	world: World,
	entity: Entity,
	filter: RelationFilter
): boolean {
	const { relation, target } = filter;
	const ctx = world[$internal];

	// First check if entity has the base trait bitflag
	// This is the hybrid bitmask optimization - fast bitwise check before target lookup
	const baseTrait = relation[$internal].trait;
	const traitData = getTraitData(ctx.traitData, baseTrait);
	if (!traitData) return false;

	const { generationId, bitflag } = traitData;
	const eid = entity & 0xfffff; // ENTITY_ID_MASK
	const entityMask = ctx.entityMasks[generationId][eid];

	// Fast bitmask check: does entity have this relation type at all?
	if ((entityMask & bitflag) !== bitflag) return false;

	// Wildcard target - if entity has the base trait bitflag, it MUST have at least one target
	// (base trait is only added when first target is added, removed when last target is removed)
	// So we can skip the expensive getRelationTargets() call and just return true
	if (target === '*') {
		return true;
	}

	// Specific target - use O(1) lookup from relationTargets array
	if (typeof target === 'number') {
		return hasRelationToTarget(world, relation, entity, target);
	}

	return false;
}
