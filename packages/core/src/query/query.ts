import { $internal } from '../common';
import type { Entity } from '../entity/types';
import { getEntityId } from '../entity/utils/pack-entity';
import { getEntitiesTargeting, isRelationPair, isWildcard } from '../relation/relation';
import type { Relation } from '../relation/types';
import { registerTrait, trait } from '../trait/trait';
import type { Trait, TraitData } from '../trait/types';
import { SparseSet } from '../utils/sparse-set';
import type { World } from '../world/world';
import { isModifier } from './modifier';
import { createQueryResult, getQueryStores } from './query-result';
import type { EventType, Query, QueryParameter, QueryResult, QuerySubscriber } from './types';
import { checkQuery } from './utils/check-query';
import { checkQueryTracking } from './utils/check-query-tracking';
import { checkQueryWithRelations } from './utils/check-query-with-relations';
import { createQueryHash } from './utils/create-query-hash';
import { getTraitData, hasTraitData } from '../trait/utils/trait-data';

export const IsExcluded = trait();

export function runQuery<T extends QueryParameter[]>(world: World, query: Query<T>): QueryResult<T> {
	commitQueryRemovals(world);

	// With hybrid bitmask strategy, query.entities is already incrementally maintained
	// with both trait and relation filters applied. Just return the pre-filtered entities.
	const entities = query.entities.dense.slice() as Entity[];

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
				if (!hasTraitData(ctx.traitData, baseTrait)) registerTrait(world, baseTrait);
				query.traitData.required.push(getTraitData(ctx.traitData, baseTrait)!);
				query.traits.push(baseTrait);
			}

			continue;
		}

		if (isModifier(parameter)) {
			const traits = parameter.traits;

			// Register traits if they don't exist.
			for (let j = 0; j < traits.length; j++) {
				const trait = traits[j];
				if (!hasTraitData(ctx.traitData, trait)) registerTrait(world, trait);
			}

			if (parameter.type === 'not') {
				query.traitData.forbidden.push(
					...traits.map((trait) => getTraitData(ctx.traitData, trait)!)
				);
			}

			if (parameter.type === 'or') {
				query.traitData.or.push(
					...traits.map((trait) => getTraitData(ctx.traitData, trait)!)
				);
			}

			if (parameter.type.includes('added')) {
				for (const trait of traits) {
					const data = getTraitData(ctx.traitData, trait)!;
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
					const data = getTraitData(ctx.traitData, trait)!;
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
					const data = getTraitData(ctx.traitData, trait)!;
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
			if (!hasTraitData(ctx.traitData, trait)) registerTrait(world, trait);
			query.traitData.required.push(getTraitData(ctx.traitData, trait)!);
			query.traits.push(trait);
		}
	}

	// Add IsExcluded to the forbidden list.
	query.traitData.forbidden.push(getTraitData(ctx.traitData, IsExcluded)!);

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

	// Index queries with relation filters by their relations
	const hasRelationFilters = query.relationFilters && query.relationFilters.length > 0;
	let hasWildcardRelationFilter = false;

	if (hasRelationFilters) {
		for (const filter of query.relationFilters!) {
			if (filter.isWildcardRelation) {
				hasWildcardRelationFilter = true;
				// Wildcard queries affect all relations - add to all relation traits' relationQueries
				for (const relation of ctx.relations) {
					const relationTrait = relation[$internal].trait;
					const relationTraitData = getTraitData(ctx.traitData, relationTrait);
					if (relationTraitData) {
						relationTraitData.relationQueries.add(query);
					}
				}
			} else {
				// Non-wildcard queries - add to this specific relation's relationQueries
				const relationTrait = filter.relation[$internal].trait;
				const relationTraitData = getTraitData(ctx.traitData, relationTrait);
				if (relationTraitData) {
					relationTraitData.relationQueries.add(query);
				}
			}
		}
	}

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
		if (hasWildcardRelationFilter) {
			// For Wildcard(target) queries, use getEntitiesTargeting to populate
			const wildcardFilter = query.relationFilters!.find((f) => f.isWildcardRelation);
			if (wildcardFilter && typeof wildcardFilter.target === 'number') {
				const entities = getEntitiesTargeting(world, wildcardFilter.target as Entity);
				const hasTraitFilters =
					query.traitData.required.length > 0 ||
					query.traitData.forbidden.length > 0 ||
					query.traitData.or.length > 0;
				for (const entity of entities) {
					// Check if entity matches any other filters (traits, etc.)
					const match = hasTraitFilters
						? checkQueryWithRelations(world, query, entity)
						: true; // Pure wildcard query, all entities match
					if (match) query.add(entity);
				}
			}
		} else {
			const entities = ctx.entityIndex.dense;
			for (let i = 0; i < entities.length; i++) {
				const entity = entities[i];
				// Use checkQueryWithRelations if query has relation filters, otherwise use checkQuery
				const match = hasRelationFilters
					? checkQueryWithRelations(world, query, entity)
					: query.check(world, entity);
				if (match) query.add(entity);
			}
		}
	}

	// Pre-compute result stores and traits.
	getQueryStores(parameters, query.resultTraits, query.resultStores, world);

	return query;
}
