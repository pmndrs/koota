import { trait, registerTrait } from '../trait/trait';
import { TraitData } from '../trait/trait-data';
import { Trait } from '../trait/types';
import { Entity } from '../entity/types';
import { SparseSet } from '../utils/sparse-set';
import { $internal } from '../common';
import { World } from '../world/world';
import { ModifierData } from './modifier';
import { QueryParameter, QuerySubscriber } from './types';
import { createQueryHash } from './utils/create-query-hash';
import { getEntityId } from '../entity/utils/pack-entity';

export const IsExcluded = trait();

export class Query {
	version = 0;
	world: World;
	parameters: QueryParameter[];
	hash: string;
	traits: Trait[] = [];
	traitData: {
		required: TraitData[];
		forbidden: TraitData[];
		or: TraitData[];
		added: TraitData[];
		removed: TraitData[];
		changed: TraitData[];
		all: TraitData[];
	} = { required: [], forbidden: [], or: [], added: [], removed: [], changed: [], all: [] };
	bitmasks: {
		required: number;
		forbidden: number;
		or: number;
		added: number;
		removed: number;
		changed: number;
		addedTracker: number[];
		removedTracker: number[];
		changedTracker: number[];
	}[] = [];
	generations: number[];
	entities = new SparseSet();
	isTracking = false;
	hasChangedModifiers = false;
	changedTraits = new Set<Trait>();
	toRemove = new SparseSet();
	addSubscriptions = new Set<QuerySubscriber>();
	removeSubscriptions = new Set<QuerySubscriber>();

	constructor(world: World, parameters: QueryParameter[] = []) {
		this.world = world;
		this.parameters = parameters;
		const ctx = world[$internal];

		// Initialize tracking paramters.
		const trackingParams: {
			type: 'add' | 'remove' | 'change';
			id: number;
			traits: TraitData[];
		}[] = [];

		// Iterate over the parameters and run any modifiers.
		// Sort into traits and not-traits.
		for (let i = 0; i < parameters.length; i++) {
			const parameter = parameters[i];

			if (parameter instanceof ModifierData) {
				const traits = parameter.traits;

				// Register traits if they don't exist.
				for (let j = 0; j < traits.length; j++) {
					const trait = traits[j];
					if (!ctx.traitData.has(trait)) registerTrait(world, trait);
				}

				if (parameter.type === 'not') {
					this.traitData.forbidden.push(
						...traits.map((trait) => ctx.traitData.get(trait)!)
					);
				}

				if (parameter.type === 'or') {
					this.traitData.or.push(...traits.map((trait) => ctx.traitData.get(trait)!));
				}

				if (parameter.type.includes('added')) {
					for (const trait of traits) {
						const data = ctx.traitData.get(trait)!;
						this.traitData.added.push(data);
						this.traits.push(trait);
					}

					this.isTracking = true;

					const id = parameter.type.split('-')[1];
					trackingParams.push({
						type: 'add',
						id: parseInt(id),
						traits: this.traitData.added,
					});
				}

				if (parameter.type.includes('removed')) {
					for (const trait of traits) {
						const data = ctx.traitData.get(trait)!;
						this.traitData.removed.push(data);
						this.traits.push(trait);
					}

					this.isTracking = true;

					const id = parameter.type.split('-')[1];
					trackingParams.push({
						type: 'remove',
						id: parseInt(id),
						traits: this.traitData.removed,
					});
				}

				if (parameter.type.includes('changed')) {
					for (const trait of traits) {
						this.changedTraits.add(trait);
						const data = ctx.traitData.get(trait)!;
						this.traitData.changed.push(data);
						this.traits.push(trait);
						this.hasChangedModifiers = true;
					}

					this.isTracking = true;

					const id = parameter.type.split('-')[1];
					trackingParams.push({
						type: 'change',
						id: parseInt(id),
						traits: this.traitData.changed,
					});
				}
			} else {
				const trait = parameter as Trait;
				if (!ctx.traitData.has(trait)) registerTrait(world, trait);
				this.traitData.required.push(ctx.traitData.get(trait)!);
				this.traits.push(trait);
			}
		}

		// Add IsExcluded to the forbidden list.
		this.traitData.forbidden.push(ctx.traitData.get(IsExcluded)!);

		this.traitData.all = [
			...this.traitData.required,
			...this.traitData.forbidden,
			...this.traitData.or,
			...this.traitData.added,
			...this.traitData.removed,
			...this.traitData.changed,
		];

		console.log('traitData', this.traitData);

		// Create an array of all trait generations.
		this.generations = this.traitData.all
			.map((c) => c.generationId)
			.reduce((a: number[], v) => {
				if (a.includes(v)) return a;
				a.push(v);
				return a;
			}, []);

		// Create bitmasks.
		this.bitmasks = this.generations.map((generationId) => {
			const required = this.traitData.required
				.filter((c) => c.generationId === generationId)
				.reduce((a, c) => a | c.bitflag, 0);

			const forbidden = this.traitData.forbidden
				.filter((c) => c.generationId === generationId)
				.reduce((a, c) => a | c.bitflag, 0);

			const or = this.traitData.or
				.filter((c) => c.generationId === generationId)
				.reduce((a, c) => a | c.bitflag, 0);

			const added = this.traitData.added
				.filter((c) => c.generationId === generationId)
				.reduce((a, c) => a | c.bitflag, 0);

			const removed = this.traitData.removed
				.filter((c) => c.generationId === generationId)
				.reduce((a, c) => a | c.bitflag, 0);

			const changed = this.traitData.changed
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
		this.hash = createQueryHash(parameters);

		// Add it to world.
		ctx.queries.add(this);
		ctx.queriesHashMap.set(this.hash, this);

		// Add query to each trait instance.
		this.traitData.all.forEach((instance) => {
			instance.queries.add(this);
		});

		// Add query instance to the world's not-query store.
		if (this.traitData.forbidden.length > 0) ctx.notQueries.add(this);

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
									((oldMask & bitflag) === bitflag &&
										(currentMask & bitflag) === 0) ||
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
						this.add(entity);
					}
				}
			}
		} else {
			// Populate the query immediately.
			if (
				this.traitData.required.length > 0 ||
				this.traitData.forbidden.length > 0 ||
				this.traitData.or.length > 0
			) {
				const entities = ctx.entityIndex.dense;
				for (let i = 0; i < entities.length; i++) {
					const entity = entities[i];
					const match = this.check(world, entity);
					if (match) this.add(entity);
				}
			}
		}
	}

	run(world: World): Entity[] {
		this.commitRemovals(world);
		const result = this.entities.dense.slice();

		// Clear so it can accumulate again.
		if (this.isTracking) this.entities.clear();

		return result as Entity[];
	}

	add(entity: Entity) {
		this.toRemove.remove(entity);
		this.entities.add(entity);

		// Notify subscriptions.
		for (const sub of this.addSubscriptions) {
			sub(entity);
		}

		this.version++;
	}

	remove(world: World, entity: Entity) {
		if (!this.entities.has(entity) || this.toRemove.has(entity)) return;

		const ctx = world[$internal];

		this.toRemove.add(entity);
		ctx.dirtyQueries.add(this);

		// Notify subscriptions.
		for (const sub of this.removeSubscriptions) {
			sub(entity);
		}

		this.version++;
	}

	check(
		world: World,
		entity: Entity,
		event?: { type: 'add' | 'remove' | 'change'; traitData: TraitData }
	) {
		const { bitmasks, generations } = this;
		const ctx = world[$internal];
		const eid = getEntityId(entity);

		// If the query is empty, the check fails.
		if (this.traitData.all.length === 0) return false;

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
			if (this.isTracking && isEventGeneration) {
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

	commitRemovals(world: World) {
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

	resetTrackingBitmasks(eid: number) {
		for (const bitmask of this.bitmasks) {
			bitmask.addedTracker[eid] = 0;
			bitmask.removedTracker[eid] = 0;
			bitmask.changedTracker[eid] = 0;
		}
	}
}
