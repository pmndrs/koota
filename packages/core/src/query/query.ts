import { $internal } from '../common';
import type { Entity } from '../entity/types';
import { getEntityId } from '../entity/utils/pack-entity';
import {
	getEntitiesTargeting,
	getEntitiesWithRelationTo,
	getRelationTargets,
	hasRelationToTarget,
	isRelationPair,
	isWildcard,
	Wildcard,
} from '../relation/relation';
import type { Relation, RelationTarget } from '../relation/types';
import { registerTrait, trait } from '../trait/trait';
import type { Trait, TraitData } from '../trait/types';
import { SparseSet } from '../utils/sparse-set';
import type { World } from '../world/world';
import { isModifier } from './modifier';
import { createQueryResult, getQueryStores } from './query-result';
import type { Query, QueryParameter, QueryResult, QuerySubscriber } from './types';
import { createQueryHash } from './utils/create-query-hash';

type EventType = 'add' | 'remove' | 'change';

/** Filter for checking relation targets */
interface RelationFilter {
	relation: Relation<Trait>;
	target: RelationTarget;
	isWildcardRelation: boolean;
}

export const IsExcluded = trait();

export function runQuery<T extends QueryParameter[]>(world: World, query: Query<T>): QueryResult<T> {
	commitQueryRemovals(world);

	let entities: Entity[];
	let usedTargetIndex = false;

	// Handle relation queries specially
	if (query.relationFilters && query.relationFilters.length > 0) {
		const filter = query.relationFilters[0];
		if (typeof filter.target === 'number') {
			if (filter.isWildcardRelation) {
				// Use reverse index for Wildcard(target) queries
				entities = getEntitiesTargeting(world, filter.target as Entity).slice() as Entity[];
			} else {
				// Use reverse index for Relation(specificTarget) queries
				entities = getEntitiesWithRelationTo(
					world,
					filter.relation,
					filter.target as Entity
				).slice() as Entity[];
			}
			usedTargetIndex = true;
		} else {
			entities = query.entities.dense.slice() as Entity[];
		}
	} else {
		entities = query.entities.dense.slice() as Entity[];
	}

	// Apply remaining relation filters
	if (query.relationFilters && query.relationFilters.length > (usedTargetIndex ? 1 : 0)) {
		const filtersToApply = usedTargetIndex
			? query.relationFilters.slice(1)
			: query.relationFilters;

		if (filtersToApply.length > 0) {
			entities = entities.filter((entity) => {
				for (const filter of filtersToApply) {
					if (!checkRelationFilter(world, entity, filter)) {
						return false;
					}
				}
				return true;
			});
		}
	}

	// Clear so it can accumulate again.
	if (query.isTracking) {
		query.entities.clear();
		// @todo: Need to improve the performance of this loop.
		for (const eid of entities) {
			query.resetTrackingBitmasks(eid);
		}
	}

	return createQueryResult(world, entities, query);
}

function checkRelationFilter(world: World, entity: Entity, filter: RelationFilter): boolean {
	const { relation, target, isWildcardRelation } = filter;

	// Wildcard relation - check if entity has any relation to target
	if (isWildcardRelation) {
		if (typeof target === 'number') {
			const eid = getEntityId(entity);
			const index = Wildcard[$internal].targetIndex[target];
			return index !== undefined && index.has(eid);
		}
		return false;
	}

	// Wildcard target - check if entity has any target for this relation
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

export function addEntityToQuery(query: Query, entity: Entity) {
	query.toRemove.remove(entity);
	query.entities.add(entity);

	// Notify subscriptions.
	for (const sub of query.addSubscriptions) {
		sub(entity);
	}

	query.version++;
}

export function removeEntityFromQuery(world: World, query: Query, entity: Entity) {
	if (!query.entities.has(entity) || query.toRemove.has(entity)) return;

	const ctx = world[$internal];

	query.toRemove.add(entity);
	ctx.dirtyQueries.add(query);

	// Notify subscriptions.
	for (const sub of query.removeSubscriptions) {
		sub(entity);
	}

	query.version++;
}

/**
 * Check if an entity matches a non-tracking query.
 * For tracking queries, use checkQueryTracking instead.
 */
export function checkQuery(world: World, query: Query, entity: Entity): boolean {
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

/**
 * Check if an entity matches a tracking query with event handling.
 */
export function checkQueryTracking(
	world: World,
	query: Query,
	entity: Entity,
	eventType: EventType,
	eventGenerationId: number,
	eventBitflag: number
): boolean {
	const { bitmasks, generations } = query;
	const ctx = world[$internal];
	const eid = getEntityId(entity);

	if (query.traitData.all.length === 0) return false;

	for (let i = 0; i < generations.length; i++) {
		const generationId = generations[i];
		const bitmask = bitmasks[i];
		const { required, forbidden, or, added, removed, changed } = bitmask;
		const entityMask = ctx.entityMasks[generationId][eid];

		if (!forbidden && !required && !or && !removed && !added && !changed) {
			return false;
		}

		// Handle events only for matching generation
		if (eventGenerationId === generationId) {
			if (eventType === 'add') {
				if (removed & eventBitflag) return false;
				if (added & eventBitflag) {
					bitmask.addedTracker[eid] |= eventBitflag;
				}
			} else if (eventType === 'remove') {
				if (added & eventBitflag) return false;
				if (removed & eventBitflag) {
					bitmask.removedTracker[eid] |= eventBitflag;
				}
				if (changed & eventBitflag) return false;
			} else if (eventType === 'change') {
				if (!(entityMask & eventBitflag)) return false;
				if (changed & eventBitflag) {
					bitmask.changedTracker[eid] |= eventBitflag;
				}
			}
		}

		// Check forbidden traits
		if ((entityMask & forbidden) !== 0) return false;

		// Check required traits
		if ((entityMask & required) !== required) return false;

		// Check Or traits
		if (or !== 0 && (entityMask & or) === 0) return false;

		// Check tracking masks only for matching generation
		if (eventGenerationId === generationId) {
			if (added) {
				const entityAddedTracker = bitmask.addedTracker[eid] || 0;
				if ((entityAddedTracker & added) !== added) return false;
			}
			if (removed) {
				const entityRemovedTracker = bitmask.removedTracker[eid] || 0;
				if ((entityRemovedTracker & removed) !== removed) return false;
			}
			if (changed) {
				const entityChangedTracker = bitmask.changedTracker[eid] || 0;
				if ((entityChangedTracker & changed) !== changed) return false;
			}
		}
	}

	return true;
}

export function commitQueryRemovals(world: World) {
	const ctx = world[$internal];
	if (!ctx.dirtyQueries.size) return;

	for (const query of ctx.dirtyQueries) {
		for (let i = query.toRemove.dense.length - 1; i >= 0; i--) {
			const eid = query.toRemove.dense[i];
			query.toRemove.remove(eid);
			query.entities.remove(eid);
		}
	}

	ctx.dirtyQueries.clear();
}

export function resetQueryTrackingBitmasks(query: Query, eid: number) {
	for (const bitmask of query.bitmasks) {
		bitmask.addedTracker[eid] = 0;
		bitmask.removedTracker[eid] = 0;
		bitmask.changedTracker[eid] = 0;
	}
}

export function createQuery<T extends QueryParameter[]>(world: World, parameters: T): Query {
	const query: Query = {
		version: 0,
		world,
		parameters,
		hash: '',
		traits: [],
		resultStores: [],
		resultTraits: [],
		traitData: {
			required: [],
			forbidden: [],
			or: [],
			added: [],
			removed: [],
			changed: [],
			all: [],
		},
		bitmasks: [],
		generations: [],
		entities: new SparseSet(),
		isTracking: false,
		hasChangedModifiers: false,
		changedTraits: new Set<Trait>(),
		toRemove: new SparseSet(),
		addSubscriptions: new Set<QuerySubscriber>(),
		removeSubscriptions: new Set<QuerySubscriber>(),
		relationFilters: [],

		run: (world: World) => runQuery(world, query),
		add: (entity: Entity) => addEntityToQuery(query, entity),
		remove: (world: World, entity: Entity) => removeEntityFromQuery(world, query, entity),
		check: (world: World, entity: Entity) => checkQuery(world, query, entity),
		checkTracking: (
			world: World,
			entity: Entity,
			eventType: EventType,
			generationId: number,
			bitflag: number
		) => checkQueryTracking(world, query, entity, eventType, generationId, bitflag),
		resetTrackingBitmasks: (eid: number) => resetQueryTrackingBitmasks(query, eid),
	};

	const ctx = world[$internal];

	// Initialize tracking parameters.
	const trackingParams: {
		type: 'add' | 'remove' | 'change';
		id: number;
		traits: TraitData[];
	}[] = [];

	// Iterate over the parameters and run any modifiers.
	// Sort into traits and not-traits.
	for (let i = 0; i < parameters.length; i++) {
		const parameter = parameters[i];

		// Handle relation pairs
		if (isRelationPair(parameter)) {
			const pairCtx = parameter[$internal];
			const relation = pairCtx.relation;
			const target = pairCtx.target;
			const wildcardRelation = isWildcard(relation);

			// Add relation filter
			query.relationFilters!.push({
				relation: relation as Relation<Trait>,
				target,
				isWildcardRelation: wildcardRelation,
			});

			// For non-wildcard relations, add the base trait as required
			if (!wildcardRelation) {
				const baseTrait = (relation as Relation<Trait>)[$internal].trait;
				if (!ctx.traitData.has(baseTrait)) registerTrait(world, baseTrait);
				query.traitData.required.push(ctx.traitData.get(baseTrait)!);
				query.traits.push(baseTrait);
			}

			continue;
		}

		if (isModifier(parameter)) {
			const traits = parameter.traits;

			// Register traits if they don't exist.
			for (let j = 0; j < traits.length; j++) {
				const trait = traits[j];
				if (!ctx.traitData.has(trait)) registerTrait(world, trait);
			}

			if (parameter.type === 'not') {
				query.traitData.forbidden.push(...traits.map((trait) => ctx.traitData.get(trait)!));
			}

			if (parameter.type === 'or') {
				query.traitData.or.push(...traits.map((trait) => ctx.traitData.get(trait)!));
			}

			if (parameter.type.includes('added')) {
				for (const trait of traits) {
					const data = ctx.traitData.get(trait)!;
					query.traitData.added.push(data);
					query.traits.push(trait);
				}

				query.isTracking = true;

				const id = parameter.type.split('-')[1];
				trackingParams.push({
					type: 'add',
					id: parseInt(id),
					traits: query.traitData.added,
				});
			}

			if (parameter.type.includes('removed')) {
				for (const trait of traits) {
					const data = ctx.traitData.get(trait)!;
					query.traitData.removed.push(data);
					query.traits.push(trait);
				}

				query.isTracking = true;

				const id = parameter.type.split('-')[1];
				trackingParams.push({
					type: 'remove',
					id: parseInt(id),
					traits: query.traitData.removed,
				});
			}

			if (parameter.type.includes('changed')) {
				for (const trait of traits) {
					query.changedTraits.add(trait);
					const data = ctx.traitData.get(trait)!;
					query.traitData.changed.push(data);
					query.traits.push(trait);
					query.hasChangedModifiers = true;
				}

				query.isTracking = true;

				const id = parameter.type.split('-')[1];
				trackingParams.push({
					type: 'change',
					id: parseInt(id),
					traits: query.traitData.changed,
				});
			}
		} else {
			const trait = parameter as Trait;
			if (!ctx.traitData.has(trait)) registerTrait(world, trait);
			query.traitData.required.push(ctx.traitData.get(trait)!);
			query.traits.push(trait);
		}
	}

	// Add IsExcluded to the forbidden list.
	query.traitData.forbidden.push(ctx.traitData.get(IsExcluded)!);

	query.traitData.all = [
		...query.traitData.required,
		...query.traitData.forbidden,
		...query.traitData.or,
		...query.traitData.added,
		...query.traitData.removed,
		...query.traitData.changed,
	];

	// Create an array of all trait generations.
	query.generations = query.traitData.all
		.map((c) => c.generationId)
		.reduce((a: number[], v) => {
			if (a.includes(v)) return a;
			a.push(v);
			return a;
		}, []);

	// Create bitmasks.
	query.bitmasks = query.generations.map((generationId) => {
		const required = query.traitData.required
			.filter((c) => c.generationId === generationId)
			.reduce((a, c) => a | c.bitflag, 0);

		const forbidden = query.traitData.forbidden
			.filter((c) => c.generationId === generationId)
			.reduce((a, c) => a | c.bitflag, 0);

		const or = query.traitData.or
			.filter((c) => c.generationId === generationId)
			.reduce((a, c) => a | c.bitflag, 0);

		const added = query.traitData.added
			.filter((c) => c.generationId === generationId)
			.reduce((a, c) => a | c.bitflag, 0);

		const removed = query.traitData.removed
			.filter((c) => c.generationId === generationId)
			.reduce((a, c) => a | c.bitflag, 0);

		const changed = query.traitData.changed
			.filter((c) => c.generationId === generationId)
			.reduce((a, c) => a | c.bitflag, 0);

		return {
			required: required | added,
			forbidden,
			or,
			added,
			removed,
			changed,
			addedTracker: [],
			removedTracker: [],
			changedTracker: [],
		};
	});

	// Create hash.
	query.hash = createQueryHash(parameters);

	// Add it to world.
	ctx.queries.add(query);
	ctx.queriesHashMap.set(query.hash, query);

	// Add query to each trait instance, sorted by tracking status
	if (query.isTracking) {
		query.traitData.all.forEach((instance) => {
			instance.trackingQueries.add(query);
		});
	} else {
		query.traitData.all.forEach((instance) => {
			instance.queries.add(query);
		});
	}

	// Add query instance to the world's not-query store.
	if (query.traitData.forbidden.length > 0) ctx.notQueries.add(query);

	// Populate the query with tracking parameters.
	if (trackingParams.length > 0) {
		for (let i = 0; i < trackingParams.length; i++) {
			const type = trackingParams[i].type;
			const id = trackingParams[i].id;
			const traits = trackingParams[i].traits;
			const snapshot = ctx.trackingSnapshots.get(id)!;
			const dirtyMask = ctx.dirtyMasks.get(id)!;
			const changedMask = ctx.changedMasks.get(id)!;

			for (const entity of ctx.entityIndex.dense) {
				let allTraitsMatch = true;
				const eid = getEntityId(entity);

				for (const trait of traits) {
					const { generationId, bitflag } = trait;
					const oldMask = snapshot[generationId]?.[eid] || 0;
					const currentMask = ctx.entityMasks[generationId]?.[eid] || 0;

					let traitMatches = false;

					switch (type) {
						case 'add':
							traitMatches =
								(oldMask & bitflag) === 0 && (currentMask & bitflag) === bitflag;
							break;
						case 'remove':
							traitMatches =
								((oldMask & bitflag) === bitflag && (currentMask & bitflag) === 0) ||
								((oldMask & bitflag) === 0 &&
									(currentMask & bitflag) === 0 &&
									(dirtyMask[generationId][eid] & bitflag) === bitflag);
							break;
						case 'change':
							traitMatches = (changedMask[generationId][eid] & bitflag) === bitflag;
							break;
					}

					if (!traitMatches) {
						allTraitsMatch = false;
						break; // No need to check other traits if one doesn't match
					}
				}

				if (allTraitsMatch) {
					query.add(entity);
				}
			}
		}
	} else {
		// Populate the query immediately.
		// Skip for Wildcard(target) queries - they use the reverse index at runtime
		const hasWildcardRelationFilter = query.relationFilters?.some((f) => f.isWildcardRelation);

		if (
			!hasWildcardRelationFilter &&
			(query.traitData.required.length > 0 ||
				query.traitData.forbidden.length > 0 ||
				query.traitData.or.length > 0)
		) {
			const entities = ctx.entityIndex.dense;
			for (let i = 0; i < entities.length; i++) {
				const entity = entities[i];
				const match = query.check(world, entity);
				if (match) query.add(entity);
			}
		}
	}

	// Pre-compute result stores and traits.
	getQueryStores(parameters, query.resultTraits, query.resultStores, world);

	return query;
}
