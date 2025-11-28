import { $internal } from '../common';
import type { Entity } from '../entity/types';
import { getEntityId } from '../entity/utils/pack-entity';
import { checkQueryWithRelations } from '../query/utils/check-query-with-relations';
import { trait } from '../trait/trait';
import type { ConfigurableTrait, Schema, Trait } from '../trait/types';
import type { World } from '../world/world';
import type { Relation, RelationPair, RelationTarget, WildcardRelation } from './types';

/**
 * Creates a relation definition.
 * Relations are stored efficiently - one trait per relation type, not per target.
 * Targets are stored in TraitData.relationTargets.
 */
function defineRelation<S extends Schema = Record<string, never>>(definition?: {
	exclusive?: boolean;
	autoRemoveTarget?: boolean;
	store?: S;
}): Relation<Trait<S>> {
	// Create the underlying trait for this relation
	const baseTrait = trait(definition?.store ?? ({} as S)) as unknown as Trait<S>;
	const traitCtx = baseTrait[$internal];

	// Mark the trait as a relation trait
	traitCtx.relation = null!; // Will be set below after relation is created

	const relationCtx = {
		trait: baseTrait,
		exclusive: definition?.exclusive ?? false,
		autoRemoveTarget: definition?.autoRemoveTarget ?? false,
		targetIndex: [] as Set<number>[],
	};

	// The relation function creates a pair when called with a target
	function relationFn(
		target: RelationTarget,
		params?: Record<string, unknown>
	): RelationPair<Trait<S>> {
		if (target === undefined) throw Error('Relation target is undefined');

		const resolvedTarget = target === '*' ? Wildcard : target;

		return {
			[$internal]: {
				relation: relationFn as Relation<Trait<S>>,
				target: resolvedTarget,
				isWildcard: resolvedTarget === Wildcard || target === '*',
				params,
			},
		} as RelationPair<Trait<S>>;
	}

	const relation = Object.assign(relationFn, {
		[$internal]: relationCtx,
	}) as Relation<Trait<S>>;

	// Set the back-reference from trait to relation
	traitCtx.relation = relation;

	return relation;
}

export const relation = defineRelation;

/**
 * Check if a value is a RelationPair
 */
export function isRelationPair(value: unknown): value is RelationPair {
	return (
		value !== null &&
		typeof value === 'object' &&
		$internal in value &&
		'relation' in (value as RelationPair)[$internal]
	);
}

/**
 * Get the targets for a relation on an entity.
 * Returns an array of target entity IDs.
 */
/* @inline */ export function getRelationTargets(
	world: World,
	relation: Relation<Trait>,
	entity: Entity
): readonly RelationTarget[] {
	const ctx = world[$internal];
	const relationCtx = relation[$internal];
	const baseTrait = relationCtx.trait;

	const traitData = ctx.traitData.get(baseTrait);
	if (!traitData || !traitData.relationTargets) return [];

	const eid = entity & 0xfffff; // ENTITY_ID_MASK

	if (relationCtx.exclusive) {
		const target = (traitData.relationTargets as number[])[eid];
		return target ? [target as Entity] : [];
	} else {
		const targets = (traitData.relationTargets as number[][])[eid];
		return targets ? (targets.slice() as Entity[]) : [];
	}
}

/**
 * Get the index of a target in the relation's target array.
 * Returns -1 if not found. Used for accessing per-target store data.
 */
export function getTargetIndex(
	world: World,
	relation: Relation<Trait>,
	entity: Entity,
	target: RelationTarget
): number {
	const ctx = world[$internal];
	const relationCtx = relation[$internal];
	const baseTrait = relationCtx.trait;

	const traitData = ctx.traitData.get(baseTrait);
	if (!traitData || !traitData.relationTargets) return -1;

	const eid = entity & 0xfffff;
	const targetId = typeof target === 'number' ? target : 0;

	if (relationCtx.exclusive) {
		return (traitData.relationTargets as number[])[eid] === targetId ? 0 : -1;
	} else {
		const targets = (traitData.relationTargets as number[][])[eid];
		return targets ? targets.indexOf(targetId) : -1;
	}
}

/**
 * Check if an entity has a relation to a specific target.
 */
/* @inline */ export function hasRelationToTarget(
	world: World,
	relation: Relation<Trait>,
	entity: Entity,
	target: RelationTarget
): boolean {
	const ctx = world[$internal];
	const relationCtx = relation[$internal];
	const baseTrait = relationCtx.trait;

	const traitData = ctx.traitData.get(baseTrait);
	if (!traitData || !traitData.relationTargets) return false;

	const eid = entity & 0xfffff; // ENTITY_ID_MASK
	const targetId = typeof target === 'number' ? target : 0;

	if (relationCtx.exclusive) {
		return (traitData.relationTargets as number[])[eid] === targetId;
	} else {
		const targets = (traitData.relationTargets as number[][])[eid];
		return targets ? targets.includes(targetId) : false;
	}
}

/**
 * Add a relation target to an entity.
 * Returns the index of the target in the targets array.
 */
/* @inline */ export function addRelationTarget(
	world: World,
	relation: Relation<Trait>,
	entity: Entity,
	target: RelationTarget
): number {
	const ctx = world[$internal];
	const relationCtx = relation[$internal];
	const baseTrait = relationCtx.trait;

	const traitData = ctx.traitData.get(baseTrait);
	if (!traitData) return -1;

	if (!traitData.relationTargets) {
		traitData.relationTargets = [];
	}

	const eid = entity & 0xfffff; // ENTITY_ID_MASK
	const targetId = typeof target === 'number' ? target : 0;

	let targetIndex: number;

	if (relationCtx.exclusive) {
		const targets = traitData.relationTargets as number[];
		const oldTarget = targets[eid];

		// Remove from old target's reverse index
		if (oldTarget && oldTarget !== targetId) {
			const oldIndex = relationCtx.targetIndex[oldTarget];
			if (oldIndex) oldIndex.delete(eid);
			decrementWildcardRefcount(eid, oldTarget);
		}

		targets[eid] = targetId;
		targetIndex = 0; // Exclusive always has index 0
	} else {
		const targetsArray = traitData.relationTargets as number[][];
		if (!targetsArray[eid]) {
			targetsArray[eid] = [];
		}

		// Check if already exists
		const existingIndex = targetsArray[eid].indexOf(targetId);
		if (existingIndex !== -1) {
			return existingIndex;
		}

		targetIndex = targetsArray[eid].length;
		targetsArray[eid].push(targetId);
	}

	// Add to target's reverse index
	if (targetId) {
		if (!relationCtx.targetIndex[targetId]) {
			relationCtx.targetIndex[targetId] = new Set();
		}
		relationCtx.targetIndex[targetId].add(eid);

		// Increment wildcard refcount (handles Wildcard index automatically)
		incrementWildcardRefcount(eid, targetId);
	}

	// Update queries that filter by this relation
	updateQueriesForRelationChange(world, relation, entity);

	return targetIndex;
}

/**
 * Remove a relation target from an entity.
 * Returns the index that was removed, or -1 if not found.
 */
/* @inline */ export function removeRelationTarget(
	world: World,
	relation: Relation<Trait>,
	entity: Entity,
	target: RelationTarget
): number {
	const ctx = world[$internal];
	const relationCtx = relation[$internal];
	const baseTrait = relationCtx.trait;

	const traitData = ctx.traitData.get(baseTrait);
	if (!traitData || !traitData.relationTargets) return -1;

	const eid = entity & 0xfffff; // ENTITY_ID_MASK
	const targetId = typeof target === 'number' ? target : 0;

	let removedIndex = -1;

	if (relationCtx.exclusive) {
		const targets = traitData.relationTargets as number[];
		if (targets[eid] === targetId) {
			targets[eid] = 0;
			removedIndex = 0;
			// Clear exclusive data
			clearRelationDataInternal(traitData.store, baseTrait[$internal].type, eid, 0, true);
		}
	} else {
		const targetsArray = traitData.relationTargets as number[][];
		const entityTargets = targetsArray[eid];
		if (entityTargets) {
			const idx = entityTargets.indexOf(targetId);
			if (idx !== -1) {
				const lastIdx = entityTargets.length - 1;
				// Swap-and-pop targets
				if (idx !== lastIdx) {
					entityTargets[idx] = entityTargets[lastIdx];
				}
				entityTargets.pop();
				// Swap-and-pop data to match
				swapAndPopRelationData(traitData.store, baseTrait[$internal].type, eid, idx, lastIdx);
				removedIndex = idx;
			}
		}
	}

	// Remove from this relation's target reverse index
	if (removedIndex !== -1 && targetId) {
		const index = relationCtx.targetIndex[targetId];
		if (index) {
			index.delete(eid);
			if (index.size === 0) {
				relationCtx.targetIndex[targetId] = undefined!;
			}
		}

		// Decrement wildcard refcount and remove if zero
		decrementWildcardRefcount(eid, targetId);
	}

	// Update queries that filter by this relation
	if (removedIndex !== -1) {
		updateQueriesForRelationChange(world, relation, entity);
	}

	return removedIndex;
}

/**
 * Update queries when relation targets change.
 * Called after addRelationTarget or removeRelationTarget to keep queries in sync.
 */
function updateQueriesForRelationChange(
	world: World,
	relation: Relation<Trait>,
	entity: Entity
): void {
	const ctx = world[$internal];
	const baseTrait = relation[$internal].trait;
	const traitData = ctx.traitData.get(baseTrait);
	if (!traitData) return;

	// Update all queries that have filters for this relation
	for (const query of ctx.queries) {
		if (!query.relationFilters || query.relationFilters.length === 0) continue;

		// Check if this query filters by this relation
		const hasRelationFilter = query.relationFilters.some(
			(filter) => filter.relation === relation || filter.isWildcardRelation
		);
		if (!hasRelationFilter) continue;

		// Re-check entity against query
		const match = checkQueryWithRelations(world, query, entity);
		if (match) {
			query.add(entity);
		} else {
			query.remove(world, entity);
		}
	}
}

/** Swap-and-pop data arrays for non-exclusive relations */
/* @inline */ function swapAndPopRelationData(
	store: any,
	type: string,
	eid: number,
	idx: number,
	lastIdx: number
): void {
	if (type === 'aos') {
		const arr = store[eid];
		if (arr) {
			if (idx !== lastIdx) arr[idx] = arr[lastIdx];
			arr.pop();
		}
	} else {
		for (const key in store) {
			const arr = store[key][eid];
			if (arr) {
				if (idx !== lastIdx) arr[idx] = arr[lastIdx];
				arr.pop();
			}
		}
	}
}

/** Clear data for exclusive relations */
/* @inline */ function clearRelationDataInternal(
	store: any,
	type: string,
	eid: number,
	_idx: number,
	exclusive: boolean
): void {
	if (!exclusive) return;
	if (type === 'aos') {
		store[eid] = undefined;
	} else {
		for (const key in store) {
			store[key][eid] = undefined;
		}
	}
}

/** Wildcard refcount: tracks how many relations an entity has to each target */
const wildcardRefcount: number[][] = [];
/** Flag to track if wildcard indexing is enabled for lazy initialization */
let wildcardIndexEnabled = false;

/* @inline */ function incrementWildcardRefcount(eid: number, targetId: number): void {
	if (!wildcardIndexEnabled) return;

	if (!wildcardRefcount[targetId]) {
		wildcardRefcount[targetId] = [];
	}
	const current = wildcardRefcount[targetId][eid] || 0;
	wildcardRefcount[targetId][eid] = current + 1;

	// Add to Wildcard index if this is the first relation to this target
	if (current === 0) {
		if (!Wildcard[$internal].targetIndex[targetId]) {
			Wildcard[$internal].targetIndex[targetId] = new Set();
		}
		Wildcard[$internal].targetIndex[targetId].add(eid);
	}
}

/* @inline */ function decrementWildcardRefcount(eid: number, targetId: number): void {
	if (!wildcardIndexEnabled || !wildcardRefcount[targetId]) return;

	const current = wildcardRefcount[targetId][eid] || 0;
	if (current <= 1) {
		wildcardRefcount[targetId][eid] = 0;

		// Remove from Wildcard index since no more relations to this target
		const wildcardIndex = Wildcard[$internal].targetIndex[targetId];
		if (wildcardIndex) {
			wildcardIndex.delete(eid);
			if (wildcardIndex.size === 0) {
				Wildcard[$internal].targetIndex[targetId] = undefined!;
			}
		}
	} else {
		wildcardRefcount[targetId][eid] = current - 1;
	}
}

/**
 * Rebuild wildcard index from all existing relations.
 * Called lazily on first Wildcard(target) query.
 * Uses cached targetIndex arrays and world's relations Set for fast iteration.
 */
function rebuildWildcardIndex(world: World): void {
	const ctx = world[$internal];

	// Use cached relations Set - much faster than iterating all traitData
	for (const relation of ctx.relations) {
		const relationCtx = relation[$internal];
		const targetIndex = relationCtx.targetIndex;

		for (let targetId = 0; targetId < targetIndex.length; targetId++) {
			const eidSet = targetIndex[targetId];
			if (!eidSet || eidSet.size === 0) continue;

			// Initialize wildcard index for this target if needed
			if (!Wildcard[$internal].targetIndex[targetId]) {
				Wildcard[$internal].targetIndex[targetId] = new Set();
			}
			const wildcardSet = Wildcard[$internal].targetIndex[targetId];

			// Initialize refcount array for this target if needed
			if (!wildcardRefcount[targetId]) {
				wildcardRefcount[targetId] = [];
			}

			// Add all entities from this relation's targetIndex to wildcard index
			for (const eid of eidSet) {
				wildcardSet.add(eid);
				// Increment refcount (multiple relations can point same entity->target)
				wildcardRefcount[targetId][eid] = (wildcardRefcount[targetId][eid] || 0) + 1;
			}
		}
	}

	wildcardIndexEnabled = true;
}

/**
 * Remove all relation targets from an entity.
 */
export function removeAllRelationTargets(
	world: World,
	relation: Relation<Trait>,
	entity: Entity
): void {
	const targets = getRelationTargets(world, relation, entity);
	for (const target of targets) {
		removeRelationTarget(world, relation, entity, target);
	}
}

/**
 * Get all entities that have a relation targeting a specific entity.
 * This is used for Wildcard(target) queries.
 */
export function getEntitiesTargeting(world: World, target: Entity): readonly Entity[] {
	// Lazy initialization: rebuild index on first use
	if (!wildcardIndexEnabled) {
		rebuildWildcardIndex(world);
	}

	const targetId = typeof target === 'number' ? target : 0;
	const index = Wildcard[$internal].targetIndex[targetId];
	if (!index || index.size === 0) return [];

	const ctx = world[$internal];
	const entityIndex = ctx.entityIndex;
	const sparse = entityIndex.sparse;
	const dense = entityIndex.dense;
	const result: Entity[] = [];

	for (const eid of index) {
		// O(1) lookup via sparse array
		const denseIdx = sparse[eid];
		if (denseIdx !== undefined && (dense[denseIdx] & 0xfffff) === eid) {
			result.push(dense[denseIdx]);
		}
	}

	return result;
}

/**
 * Get all entities that have a specific relation targeting a specific entity.
 */
export function getEntitiesWithRelationTo(
	world: World,
	relation: Relation<Trait>,
	target: Entity
): readonly Entity[] {
	const targetId = typeof target === 'number' ? target : 0;
	const relationCtx = relation[$internal];
	const index = relationCtx.targetIndex[targetId];
	if (!index || index.size === 0) return [];

	const ctx = world[$internal];
	const entityIndex = ctx.entityIndex;
	const sparse = entityIndex.sparse;
	const dense = entityIndex.dense;
	const result: Entity[] = [];

	for (const eid of index) {
		// O(1) lookup via sparse array
		const denseIdx = sparse[eid];
		if (denseIdx !== undefined && (dense[denseIdx] & 0xfffff) === eid) {
			result.push(dense[denseIdx]);
		}
	}

	return result;
}

/**
 * Check if any entity has a relation to this target.
 */
export function isRelationTarget(world: World, target: Entity): boolean {
	// Lazy initialization: rebuild index on first use
	if (!wildcardIndexEnabled) {
		rebuildWildcardIndex(world);
	}

	const targetId = typeof target === 'number' ? target : 0;
	const index = Wildcard[$internal].targetIndex[targetId];
	return index !== undefined && index.size > 0;
}

/**
 * The Wildcard relation is used for querying all relations targeting an entity.
 */
export const Wildcard: WildcardRelation = Object.assign(
	function wildcardFn(target: RelationTarget): RelationPair<Trait> {
		if (target === undefined) throw Error('Wildcard target is undefined');

		return {
			[$internal]: {
				relation: Wildcard as unknown as Relation<Trait>,
				target: target === '*' ? Wildcard : target,
				isWildcard: true,
			},
		} as RelationPair<Trait>;
	},
	{
		[$internal]: {
			targetIndex: [] as Set<number>[],
		},
	}
) as WildcardRelation;

/**
 * Type guard to check if a relation is the Wildcard.
 */
/* @inline */ export function isWildcard(
	relation: Relation<Trait> | WildcardRelation
): relation is WildcardRelation {
	return relation === (Wildcard as unknown);
}

/**
 * Helper to create a pair - kept for backward compatibility
 */
export const Pair = <T extends Trait>(
	relation: Relation<T>,
	target: RelationTarget
): RelationPair<T> => {
	if (relation === undefined) throw Error('Relation is undefined');
	if (target === undefined) throw Error('Relation target is undefined');

	return relation(target) as RelationPair<T>;
};

// ============================================================================
// Relation Data Operations
// ============================================================================

/**
 * Get default values from schema
 */

/**
 * Set data for a specific relation target using target index.
 * For exclusive relations, index is always 0.
 * For non-exclusive, index corresponds to position in targets array.
 */
/* @inline */ export function setRelationDataAtIndex(
	world: World,
	entity: Entity,
	relation: Relation<Trait>,
	targetIndex: number,
	value: Record<string, unknown>
): void {
	const relationCtx = relation[$internal];
	const baseTrait = relationCtx.trait;
	const traitData = world[$internal].traitData.get(baseTrait);
	if (!traitData) return;

	const store = traitData.store;
	const eid = getEntityId(entity);

	if (baseTrait[$internal].type === 'aos') {
		if (relationCtx.exclusive) {
			(store as any[])[eid] = value;
		} else {
			((store as any[])[eid] ??= [])[targetIndex] = value;
		}
		return;
	}

	// SoA
	if (relationCtx.exclusive) {
		for (const key in value) {
			(store as any)[key][eid] = (value as any)[key];
		}
	} else {
		for (const key in value) {
			((store as any)[key][eid] ??= [])[targetIndex] = (value as any)[key];
		}
	}
}

/**
 * Set data for a specific relation target.
 */
export function setRelationData(
	world: World,
	entity: Entity,
	relation: Relation<Trait>,
	target: RelationTarget,
	value: Record<string, unknown>
): void {
	const targetIndex = getTargetIndex(world, relation, entity, target);
	if (targetIndex === -1) return;
	setRelationDataAtIndex(world, entity, relation, targetIndex, value);
}

/**
 * Get data for a specific relation target.
 */
export function getRelationData(
	world: World,
	entity: Entity,
	relation: Relation<Trait>,
	target: RelationTarget
): unknown {
	const ctx = world[$internal];
	const baseTrait = relation[$internal].trait;
	const traitData = ctx.traitData.get(baseTrait);
	if (!traitData) return undefined;

	const targetIndex = getTargetIndex(world, relation, entity, target);
	if (targetIndex === -1) return undefined;

	const traitCtx = baseTrait[$internal];
	const store = traitData.store;
	const eid = getEntityId(entity);
	const relationCtx = relation[$internal];

	if (traitCtx.type === 'aos') {
		if (relationCtx.exclusive) {
			return (store as any[])[eid];
		} else {
			return (store as any[][])[eid]?.[targetIndex];
		}
	} else {
		// SoA: reconstruct object from store arrays
		const result: Record<string, unknown> = {};
		for (const key in store) {
			if (relationCtx.exclusive) {
				result[key] = (store as any)[key][eid];
			} else {
				result[key] = (store as any)[key][eid]?.[targetIndex];
			}
		}
		return result;
	}
}

/**
 * Check if entity has a relation pair.
 */
export function hasRelationPair(
	world: World,
	entity: Entity,
	pair: RelationPair,
	hasTrait: (world: World, entity: Entity, trait: Trait) => boolean
): boolean {
	const pairCtx = pair[$internal];
	const relation = pairCtx.relation;
	const target = pairCtx.target;

	// Wildcard relation check
	if (isWildcard(relation)) {
		if (typeof target === 'number') {
			// Lazy initialization handled in getEntitiesTargeting
			// Check if entity has any relation to this target
			const eid = getEntityId(entity);
			const index = Wildcard[$internal].targetIndex[target];
			return index !== undefined && index.has(eid);
		}
		return false;
	}

	const baseTrait = relation[$internal].trait;

	// Check if entity has the base trait
	if (!hasTrait(world, entity, baseTrait)) return false;

	// Wildcard target - just check if has any target
	if (target === Wildcard || target === '*') {
		const targets = getRelationTargets(world, relation, entity);
		return targets.length > 0;
	}

	// Specific target
	if (typeof target === 'number') {
		return hasRelationToTarget(world, relation, entity, target);
	}

	return false;
}

/**
 * Type guard to check if a configurable trait is a relation pair
 */
export /* @inline @pure */ function isPairConfig(config: ConfigurableTrait): config is RelationPair {
	return isRelationPair(config);
}
