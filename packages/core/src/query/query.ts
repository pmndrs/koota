import { $internal } from '../common';
import type { Entity } from '../entity/types';
import { getEntityId } from '../entity/utils/pack-entity';
import { registerTrait, trait } from '../trait/trait';
import type { Trait, TraitData } from '../trait/types';
import { SparseSet } from '../utils/sparse-set';
import type { World } from '../world/world';
import { isModifier } from './modifier';
import type { Query, QueryParameter, QuerySubscriber } from './types';
import { createQueryHash } from './utils/create-query-hash';

type QueryEvent = { type: 'add' | 'remove' | 'change'; traitData: TraitData };

export const IsExcluded = trait();

export function runQuery(world: World, query: Query): Entity[] {
	commitQueryRemovals(world);
	const result = query.entities.dense.slice();

	// Clear so it can accumulate again.
	if (query.isTracking) {
		query.entities.clear();

		for (const eid of result) {
			query.resetTrackingBitmasks(eid);
		}
	}

	return result as Entity[];
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

export function checkQuery(world: World, query: Query, entity: Entity, event?: QueryEvent): boolean {
	const { bitmasks, generations } = query;
	const ctx = world[$internal];
	const eid = getEntityId(entity);

	// If the query is empty, the check fails.
	if (query.traitData.all.length === 0) return false;

	for (let i = 0; i < generations.length; i++) {
		const generationId = generations[i];
		const bitmask = bitmasks[i];
		const { required, forbidden, or, added, removed, changed } = bitmask;
		const entityMask = ctx.entityMasks[generationId][eid];

		// If there are no traits to match, return false.
		if (!forbidden && !required && !or && !removed && !added && !changed) {
			return false;
		}

		// Only process events for the current trait's generation or the masks will not be relevant.
		const isEventGeneration = event && event.traitData.generationId === generationId;

		// Handle events.
		if (query.isTracking && isEventGeneration) {
			const traitMask = event.traitData.bitflag;

			if (event.type === 'add') {
				if (removed & traitMask) return false;
				if (added & traitMask) {
					bitmask.addedTracker[eid] |= traitMask;
				}
			} else if (event.type === 'remove') {
				if (added & traitMask) return false;
				if (removed & traitMask) {
					bitmask.removedTracker[eid] |= traitMask;
				}
				// Remove from changed tracker when the trait is removed.
				if (changed & traitMask) return false;
			} else if (event.type === 'change') {
				// Check that the trait is on the entity.
				if (!(entityMask & traitMask)) return false;
				if (changed & traitMask) {
					bitmask.changedTracker[eid] |= traitMask;
				}
			}
		}

		// Check forbidden traits.
		if ((entityMask & forbidden) !== 0) return false;

		// Check required traits.
		if ((entityMask & required) !== required) return false;

		// Check Or traits.
		if (or !== 0 && (entityMask & or) === 0) return false;

		// Check if all required added traits have been added.
		if (added && isEventGeneration) {
			const entityAddedTracker = bitmask.addedTracker[eid] || 0;
			if ((entityAddedTracker & added) !== added) return false;
		}

		// Check if all required removed traits have been removed.
		if (removed && isEventGeneration) {
			const entityRemovedTracker = bitmask.removedTracker[eid] || 0;
			if ((entityRemovedTracker & removed) !== removed) {
				return false;
			}
		}

		// Check if all required changed traits have been changed.
		if (changed && isEventGeneration) {
			const entityChangedTracker = bitmask.changedTracker[eid] || 0;
			if ((entityChangedTracker & changed) !== changed) {
				return false;
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

export function createQuery(world: World, parameters: QueryParameter[] = []): Query {
	const query: Query = {
		version: 0,
		world,
		parameters,
		hash: '',
		traits: [],
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

		run: (world: World) => runQuery(world, query),
		add: (entity: Entity) => addEntityToQuery(query, entity),
		remove: (world: World, entity: Entity) => removeEntityFromQuery(world, query, entity),
		check: (world: World, entity: Entity, event?: QueryEvent) =>
			checkQuery(world, query, entity, event),
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

	// Add query to each trait instance.
	query.traitData.all.forEach((instance) => {
		instance.queries.add(query);
	});

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
		if (
			query.traitData.required.length > 0 ||
			query.traitData.forbidden.length > 0 ||
			query.traitData.or.length > 0
		) {
			const entities = ctx.entityIndex.dense;
			for (let i = 0; i < entities.length; i++) {
				const entity = entities[i];
				const match = query.check(world, entity);
				if (match) query.add(entity);
			}
		}
	}

	return query;
}
