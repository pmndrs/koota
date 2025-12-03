import { $internal } from '../common';
import type { Entity } from '../entity/types';
import { getEntityId } from '../entity/utils/pack-entity';
import { checkQueryWithRelations } from '../query/utils/check-query-with-relations';
import { hasTrait, trait } from '../trait/trait';
import type { ConfigurableTrait, Schema, Trait } from '../trait/types';
import type { World } from '../world/world';
import { getTraitData } from '../trait/utils/trait-data';
import type { Relation, RelationPair, RelationTarget } from './types';

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
	};

	// The relation function creates a pair when called with a target
	function relationFn(
		target: RelationTarget,
		params?: Record<string, unknown>
	): RelationPair<Trait<S>> {
		if (target === undefined) throw Error('Relation target is undefined');

		return {
			[$internal]: {
				relation: relationFn as Relation<Trait<S>>,
				target,
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
export /* @inline */ function getRelationTargets(
	world: World,
	relation: Relation<Trait>,
	entity: Entity
): readonly RelationTarget[] {
	const ctx = world[$internal];
	const relationCtx = relation[$internal];

	const traitData = getTraitData(ctx.traitData, relationCtx.trait);
	if (!traitData || !traitData.relationTargets) return [];

	const eid = getEntityId(entity);

	if (relationCtx.exclusive) {
		const target = (traitData.relationTargets as number[])[eid];
		return target ? [target as Entity] : [];
	} else {
		const targets = (traitData.relationTargets as number[][])[eid];
		return targets ? (targets.slice() as Entity[]) : [];
	}
}

/**
 * Get the first target for a relation on an entity.
 * Returns the first target entity ID, or undefined if none exists.
 * Optimized version that avoids array allocation.
 */
export /* @inline */ function getFirstRelationTarget(
	world: World,
	relation: Relation<Trait>,
	entity: Entity
): RelationTarget | undefined {
	const ctx = world[$internal];
	const relationCtx = relation[$internal];

	const traitData = getTraitData(ctx.traitData, relationCtx.trait);
	if (!traitData || !traitData.relationTargets) return undefined;

	const eid = getEntityId(entity);

	if (relationCtx.exclusive) {
		const target = (traitData.relationTargets as number[])[eid];
		return target ? (target as Entity) : undefined;
	} else {
		const targets = (traitData.relationTargets as number[][])[eid];
		return targets?.[0] as Entity | undefined;
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

	const traitData = getTraitData(ctx.traitData, baseTrait);
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
export function hasRelationToTarget(
	world: World,
	relation: Relation<Trait>,
	entity: Entity,
	target: RelationTarget
): boolean {
	const ctx = world[$internal];
	const relationCtx = relation[$internal];
	const baseTrait = relationCtx.trait;

	const traitData = getTraitData(ctx.traitData, baseTrait);
	if (!traitData || !traitData.relationTargets) return false;

	const eid = getEntityId(entity);
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
export function addRelationTarget(
	world: World,
	relation: Relation<Trait>,
	entity: Entity,
	target: RelationTarget
): number {
	const ctx = world[$internal];
	const relationCtx = relation[$internal];
	const baseTrait = relationCtx.trait;

	const traitData = getTraitData(ctx.traitData, baseTrait);
	if (!traitData) return -1;

	if (!traitData.relationTargets) {
		traitData.relationTargets = [];
	}

	const eid = getEntityId(entity);
	const targetId = typeof target === 'number' ? target : 0;

	let targetIndex: number;

	if (relationCtx.exclusive) {
		const targets = traitData.relationTargets as number[];
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

	// Update queries that filter by this relation
	updateQueriesForRelationChange(world, relation, entity);

	return targetIndex;
}

/**
 * Remove a relation target from an entity.
 * Returns the index that was removed, or -1 if not found.
 */
export function removeRelationTarget(
	world: World,
	relation: Relation<Trait>,
	entity: Entity,
	target: RelationTarget
): number {
	const ctx = world[$internal];
	const relationCtx = relation[$internal];
	const baseTrait = relationCtx.trait;

	const traitData = getTraitData(ctx.traitData, baseTrait);
	if (!traitData || !traitData.relationTargets) return -1;

	const eid = getEntityId(entity);
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

	// No reverse index cleanup needed - getEntitiesWithRelationTo builds on-demand

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
	const traitData = getTraitData(ctx.traitData, baseTrait);
	if (!traitData) return;

	// Update queries indexed by this relation (much faster than iterating all queries)
	// All queries in relationQueries already filter by this relation
	for (const query of traitData.relationQueries) {
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
function swapAndPopRelationData(
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
function clearRelationDataInternal(
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
 * Get all entities that have a specific relation targeting a specific entity.
 * Builds result on-demand by scanning relationTargets (not maintained in reverse index).
 */
export function getEntitiesWithRelationTo(
	world: World,
	relation: Relation<Trait>,
	target: Entity
): readonly Entity[] {
	const ctx = world[$internal];
	const relationCtx = relation[$internal];
	const baseTrait = relationCtx.trait;
	const traitData = getTraitData(ctx.traitData, baseTrait);
	if (!traitData || !traitData.relationTargets) return [];

	const targetId = typeof target === 'number' ? target : 0;
	const entityIndex = ctx.entityIndex;
	const sparse = entityIndex.sparse;
	const dense = entityIndex.dense;
	const result: Entity[] = [];
	const relationTargets = traitData.relationTargets;

	// Scan all entities to find those with relation to this target
	for (let eid = 0; eid < relationTargets.length; eid++) {
		let hasTarget = false;

		if (relationCtx.exclusive) {
			hasTarget = (relationTargets as number[])[eid] === targetId;
		} else {
			const targets = (relationTargets as number[][])[eid];
			hasTarget = targets ? targets.includes(targetId) : false;
		}

		if (hasTarget) {
			// O(1) lookup via sparse array
			const denseIdx = sparse[eid];
			if (denseIdx !== undefined && (dense[denseIdx] & 0xfffff) === eid) {
				result.push(dense[denseIdx]);
			}
		}
	}

	return result;
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

/**
 * Set data for a specific relation target using target index.
 * For exclusive relations, index is always 0.
 * For non-exclusive, index corresponds to position in targets array.
 */
export function setRelationDataAtIndex(
	world: World,
	entity: Entity,
	relation: Relation<Trait>,
	targetIndex: number,
	value: Record<string, unknown>
): void {
	const relationCtx = relation[$internal];
	const baseTrait = relationCtx.trait;
	const traitData = getTraitData(world[$internal].traitData, baseTrait);
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
	const traitData = getTraitData(ctx.traitData, baseTrait);
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
export function hasRelationPair(world: World, entity: Entity, pair: RelationPair): boolean {
	const pairCtx = pair[$internal];
	const relation = pairCtx.relation;
	const target = pairCtx.target;

	// Check if entity has the base trait
	if (!hasTrait(world, entity, relation[$internal].trait)) return false;

	// Wildcard target
	if (target === '*') return true;

	// Specific target
	if (typeof target === 'number') return hasRelationToTarget(world, relation, entity, target);

	return false;
}

/**
 * Type guard to check if a configurable trait is a relation pair
 */
export /* @inline @pure */ function isPairConfig(config: ConfigurableTrait): config is RelationPair {
	return isRelationPair(config);
}
