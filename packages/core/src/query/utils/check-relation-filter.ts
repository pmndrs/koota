import type { Entity } from '../../entity/types';
import {
	getRelationTargets,
	hasRelationToTarget,
	isRelationTarget,
	Wildcard,
} from '../../relation/relation';
import type { Relation, RelationTarget } from '../../relation/types';
import { $internal } from '../../common';
import type { World } from '../../world/world';

/** Filter for checking relation targets */
export interface RelationFilter {
	relation: Relation<any>;
	target: RelationTarget;
	isWildcardRelation: boolean;
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
	const { relation, target, isWildcardRelation } = filter;
	const ctx = world[$internal];
	const eid = entity & 0xfffff; // ENTITY_ID_MASK

	// Wildcard relation - check if entity has any relation to target
	if (isWildcardRelation) {
		if (typeof target === 'number') {
			// Trigger lazy initialization if needed
			if (!isRelationTarget(world, target as Entity)) return false;
			const index = Wildcard[$internal].targetIndex[target];
			return index !== undefined && index.has(eid);
		}
		return false;
	}

	// For non-wildcard relations, first check if entity has the base trait bitflag
	// This is the hybrid bitmask optimization - fast bitwise check before target lookup
	const baseTrait = relation[$internal].trait;
	const traitData = ctx.traitData.get(baseTrait);
	if (!traitData) return false;

	const { generationId, bitflag } = traitData;
	const entityMask = ctx.entityMasks[generationId][eid];

	// Fast bitmask check: does entity have this relation type at all?
	if ((entityMask & bitflag) !== bitflag) return false;

	// Wildcard target - entity has the relation type, just check if it has any targets
	if (target === Wildcard || target === '*') {
		const targets = getRelationTargets(world, relation, entity);
		return targets.length > 0;
	}

	// Specific target - use O(1) index lookup
	if (typeof target === 'number') {
		return hasRelationToTarget(world, relation, entity, target);
	}

	return false;
}
