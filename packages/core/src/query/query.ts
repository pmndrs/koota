import { registerComponent } from '../component/component';
import { ComponentRecord } from '../component/component-record';
import { Component } from '../component/types';
import { SparseSet } from '../utils/sparse-set';
import {
	$changedMasks,
	$componentRecords,
	$dirtyMasks,
	$dirtyQueries,
	$entityCursor,
	$entityMasks,
	$entitySparseSet,
	$notQueries,
	$queries,
	$queriesHashMap,
	$trackingSnapshots,
} from '../world/symbols';
import { World } from '../world/world';
import { isModifier } from './modifier';
import { $modifier } from './symbols';
import { QueryParameter, QuerySubscriber } from './types';
import { archetypeHash } from './utils/archetypes-hash';

export class Query {
	world: World;
	parameters: QueryParameter[];
	hash: string;
	components: {
		required: ComponentRecord[];
		forbidden: ComponentRecord[];
		added: ComponentRecord[];
		removed: ComponentRecord[];
		changed: ComponentRecord[];
		all: ComponentRecord[];
	} = { required: [], forbidden: [], added: [], removed: [], changed: [], all: [] };
	bitmasks: {
		required: number;
		forbidden: number;
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
	toRemove = new SparseSet();
	subscriptions = new Set<QuerySubscriber>();

	constructor(world: World, parameters: QueryParameter[] = []) {
		this.world = world;
		this.parameters = parameters;

		// Initialize tracking paramters.
		const trackingParams: {
			type: 'add' | 'remove' | 'change';
			id: number;
			components: ComponentRecord[];
		}[] = [];

		// Iterate over the parameters and run any modifiers.
		// Sort into components and not-components.
		for (let i = 0; i < parameters.length; i++) {
			const parameter = parameters[i];

			if (isModifier(parameter)) {
				const components = parameter();

				// Register components if they don't exist.
				for (let j = 0; j < components.length; j++) {
					const component = components[j];
					if (!world[$componentRecords].has(component)) registerComponent(world, component);
				}

				if (parameter[$modifier] === 'not') {
					this.components.forbidden.push(
						...components.map((component) => world[$componentRecords].get(component)!)
					);
				}

				if (parameter[$modifier].includes('added')) {
					this.components.added.push(
						...components.map((component) => world[$componentRecords].get(component)!)
					);

					this.isTracking = true;

					const id = parameter[$modifier].split('-')[1];
					trackingParams.push({
						type: 'add',
						id: parseInt(id),
						components: this.components.added,
					});
				}

				if (parameter[$modifier].includes('removed')) {
					this.components.removed.push(
						...components.map((component) => world[$componentRecords].get(component)!)
					);

					this.isTracking = true;

					const id = parameter[$modifier].split('-')[1];
					trackingParams.push({
						type: 'remove',
						id: parseInt(id),
						components: this.components.removed,
					});
				}

				if (parameter[$modifier].includes('changed')) {
					this.components.changed.push(
						...components.map((component) => world[$componentRecords].get(component)!)
					);
					this.isTracking = true;

					const id = parameter[$modifier].split('-')[1];
					trackingParams.push({
						type: 'change',
						id: parseInt(id),
						components: this.components.changed,
					});
				}

				for (let j = 0; j < components.length; j++) {
					const component = components[j];

					if (!world[$componentRecords].has(component)) {
						registerComponent(world, component);
					}
				}
			} else {
				const component = parameter as Component;
				if (!world[$componentRecords].has(component)) registerComponent(world, component);
				this.components.required.push(world[$componentRecords].get(component)!);
			}
		}

		this.components.all = [
			...this.components.required,
			...this.components.forbidden,
			...this.components.added,
			...this.components.removed,
			...this.components.changed,
		];

		// Create an array of all component generations.
		this.generations = this.components.all
			.map((c) => c.generationId)
			.reduce((a: number[], v) => {
				if (a.includes(v)) return a;
				a.push(v);
				return a;
			}, []);

		// Create bitmasks.
		this.bitmasks = this.generations.map((generationId) => {
			const required = this.components.required
				.filter((c) => c.generationId === generationId)
				.reduce((a, c) => a | c.bitflag, 0);

			const forbidden = this.components.forbidden
				.filter((c) => c.generationId === generationId)
				.reduce((a, c) => a | c.bitflag, 0);

			const added = this.components.added
				.filter((c) => c.generationId === generationId)
				.reduce((a, c) => a | c.bitflag, 0);

			const removed = this.components.removed
				.filter((c) => c.generationId === generationId)
				.reduce((a, c) => a | c.bitflag, 0);

			const changed = this.components.changed
				.filter((c) => c.generationId === generationId)
				.reduce((a, c) => a | c.bitflag, 0);

			return {
				required: required | added,
				forbidden,
				added,
				removed,
				changed,
				addedTracker: [],
				removedTracker: [],
				changedTracker: [],
			};
		});

		// Create hash.
		this.hash = archetypeHash(parameters);

		// Add it to world.
		world[$queries].add(this);
		world[$queriesHashMap].set(this.hash, this);

		// Add query to each component instance.
		this.components.all.forEach((instance) => {
			instance.queries.add(this);
		});

		// Add query instance to the world's not-query store.
		if (this.components.forbidden.length > 0) world[$notQueries].add(this);

		// If the query has an Added modifier, we populate it with its snapshot.
		if (trackingParams.length > 0) {
			for (let i = 0; i < trackingParams.length; i++) {
				const type = trackingParams[i].type;
				const id = trackingParams[i].id;
				const components = trackingParams[i].components;
				const snapshot = world[$trackingSnapshots].get(id)!;
				const dirtyMask = world[$dirtyMasks].get(id)!;
				const changedMask = world[$changedMasks].get(id)!;

				for (const entity of world.entities) {
					let allComponentsMatch = true;

					for (const component of components) {
						const { generationId, bitflag } = component;
						const oldMask = snapshot[generationId][entity] || 0;
						const currentMask = world[$entityMasks][generationId][entity];

						let componentMatches = false;

						switch (type) {
							case 'add':
								componentMatches =
									(oldMask & bitflag) === 0 && (currentMask & bitflag) === bitflag;
								break;
							case 'remove':
								componentMatches =
									((oldMask & bitflag) === bitflag &&
										(currentMask & bitflag) === 0) ||
									((oldMask & bitflag) === 0 &&
										(currentMask & bitflag) === 0 &&
										(dirtyMask[generationId][entity] & bitflag) === bitflag);
								break;
							case 'change':
								componentMatches =
									(changedMask[generationId][entity] & bitflag) === bitflag;
								break;
						}

						if (!componentMatches) {
							allComponentsMatch = false;
							break; // No need to check other components if one doesn't match
						}
					}

					if (allComponentsMatch) {
						this.add(entity);
					}
				}

				// Clean up.
				// world[$trackingSnapshots].delete(id);
				// world[$dirtyMasks].delete(id);
				// world[$changedMasks].delete(id);
			}
		} else {
			// Populate the query immediately.
			if (this.components.required.length > 0 || this.components.forbidden.length > 0) {
				for (let ent = 0; ent < world[$entityCursor]; ent++) {
					if (!world[$entitySparseSet].has(ent)) continue;

					const match = this.check(world, ent);
					if (match) this.add(ent);
				}
			}
		}
	}

	run(world: World): number[] {
		this.commitRemovals(world);

		const result = this.entities.dense.slice();

		// Clear so it can accumulate again.
		if (this.isTracking) {
			this.entities.clear();
		}

		return result;
	}

	add(entity: number) {
		this.toRemove.remove(entity);
		this.entities.add(entity);

		// Notify subscriptions.
		for (const sub of this.subscriptions) {
			sub('add', entity);
		}
	}

	remove(world: World, entity: number) {
		if (!this.entities.has(entity) || this.toRemove.has(entity)) return;

		this.toRemove.add(entity);
		world[$dirtyQueries].add(this);

		// Notify subscriptions.
		for (const sub of this.subscriptions) {
			sub('remove', entity);
		}
	}

	check(
		world: World,
		entity: number,
		event?: { type: 'add' | 'remove' | 'change'; component: ComponentRecord }
	) {
		const { bitmasks, generations } = this;

		// If the query is empty, the check fails.
		if (this.components.all.length === 0) return false;

		for (let i = 0; i < generations.length; i++) {
			const generationId = generations[i];
			const bitmask = bitmasks[i];
			const { required, forbidden, added, removed, changed } = bitmask;
			const entityMask = world[$entityMasks][generationId][entity];

			// Handle add/remove events.
			if (event && event.component.generationId === generationId && this.isTracking) {
				const componentMask = event.component.bitflag;

				if (event.type === 'add') {
					if (removed & componentMask) return false;
					if (added & componentMask) {
						bitmask.addedTracker[entity] |= componentMask;
					}
				} else if (event.type === 'remove') {
					if (added & componentMask) return false;
					if (removed & componentMask) {
						bitmask.removedTracker[entity] |= componentMask;
					}
				} else if (event.type === 'change') {
					// Check that the component is on the entity.
					if (!(entityMask & componentMask)) return false;
					if (changed & componentMask) {
						bitmask.changedTracker[entity] |= componentMask;
					}
				}
			}

			// If there are no components to match, return false.
			if (!forbidden && !required && !removed && !added && !changed) {
				return false;
			}

			// Check forbidden components.
			if ((entityMask & forbidden) !== 0) {
				return false;
			}

			// Check required components.
			if ((entityMask & required) !== required) {
				return false;
			}

			// Check if all required added components have been added.
			if (added) {
				const entityAddedTracker = bitmask.addedTracker[entity] || 0;
				if ((entityAddedTracker & added) !== added) {
					return false;
				}
			}

			// Check if all required removed components have been removed.
			if (removed) {
				const entityRemovedTracker = bitmask.removedTracker[entity] || 0;
				if ((entityRemovedTracker & removed) !== removed) {
					return false;
				}
			}

			// Check if all required changed components have been changed.
			if (changed) {
				const entityChangedTracker = bitmask.changedTracker[entity] || 0;
				if ((entityChangedTracker & changed) !== changed) {
					return false;
				}
			}
		}

		return true;
	}

	commitRemovals(world: World) {
		if (!world[$dirtyQueries].size) return;

		for (const query of world[$dirtyQueries]) {
			for (let i = query.toRemove.dense.length - 1; i >= 0; i--) {
				const eid = query.toRemove.dense[i];
				query.toRemove.remove(eid);
				query.entities.remove(eid);
			}
		}

		world[$dirtyQueries].clear();
	}
}
