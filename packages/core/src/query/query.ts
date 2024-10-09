import { define, registerComponent } from '../component/component';
import { ComponentRecord } from '../component/component-record';
import { Component } from '../component/types';
import { Entity } from '../entity/types';
import { SparseSet } from '../utils/sparse-set';
import { $internal } from '../world/symbols';
import { World } from '../world/world';
import { ModifierData } from './modifier';
import { QueryParameter, QuerySubscriber } from './types';
import { createQueryHash } from './utils/create-query-hash';

export const IsExcluded = define();

export class Query {
	world: World;
	parameters: QueryParameter[];
	hash: string;
	components: Component[] = [];
	componentRecords: {
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
			components: ComponentRecord[];
		}[] = [];

		// Iterate over the parameters and run any modifiers.
		// Sort into components and not-components.
		for (let i = 0; i < parameters.length; i++) {
			const parameter = parameters[i];

			if (parameter instanceof ModifierData) {
				const components = parameter.components;

				// Register components if they don't exist.
				for (let j = 0; j < components.length; j++) {
					const component = components[j];
					if (!ctx.componentRecords.has(component)) registerComponent(world, component);
				}

				if (parameter.type === 'not') {
					this.componentRecords.forbidden.push(
						...components.map((component) => ctx.componentRecords.get(component)!)
					);
				}

				if (parameter.type.includes('added')) {
					for (const component of components) {
						const record = ctx.componentRecords.get(component)!;
						this.componentRecords.added.push(record);
						this.components.push(component);
					}

					this.isTracking = true;

					const id = parameter.type.split('-')[1];
					trackingParams.push({
						type: 'add',
						id: parseInt(id),
						components: this.componentRecords.added,
					});
				}

				if (parameter.type.includes('removed')) {
					for (const component of components) {
						const record = ctx.componentRecords.get(component)!;
						this.componentRecords.removed.push(record);
						this.components.push(component);
					}

					this.isTracking = true;

					const id = parameter.type.split('-')[1];
					trackingParams.push({
						type: 'remove',
						id: parseInt(id),
						components: this.componentRecords.removed,
					});
				}

				if (parameter.type.includes('changed')) {
					for (const component of components) {
						const record = ctx.componentRecords.get(component)!;
						this.componentRecords.changed.push(record);
						this.components.push(component);
					}

					this.isTracking = true;

					const id = parameter.type.split('-')[1];
					trackingParams.push({
						type: 'change',
						id: parseInt(id),
						components: this.componentRecords.changed,
					});
				}
			} else {
				const component = parameter as Component;
				if (!ctx.componentRecords.has(component)) registerComponent(world, component);
				this.componentRecords.required.push(ctx.componentRecords.get(component)!);
				this.components.push(component);
			}
		}

		this.componentRecords.all = [
			...this.componentRecords.required,
			...this.componentRecords.forbidden,
			...this.componentRecords.added,
			...this.componentRecords.removed,
			...this.componentRecords.changed,
		];

		// Create an array of all component generations.
		this.generations = this.componentRecords.all
			.map((c) => c.generationId)
			.reduce((a: number[], v) => {
				if (a.includes(v)) return a;
				a.push(v);
				return a;
			}, []);

		// Create bitmasks.
		this.bitmasks = this.generations.map((generationId) => {
			const required = this.componentRecords.required
				.filter((c) => c.generationId === generationId)
				.reduce((a, c) => a | c.bitflag, 0);

			const forbidden = this.componentRecords.forbidden
				.filter((c) => c.generationId === generationId)
				.reduce((a, c) => a | c.bitflag, 0);

			const added = this.componentRecords.added
				.filter((c) => c.generationId === generationId)
				.reduce((a, c) => a | c.bitflag, 0);

			const removed = this.componentRecords.removed
				.filter((c) => c.generationId === generationId)
				.reduce((a, c) => a | c.bitflag, 0);

			const changed = this.componentRecords.changed
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
		this.hash = createQueryHash(parameters);

		// Add it to world.
		ctx.queries.add(this);
		ctx.queriesHashMap.set(this.hash, this);

		// Add query to each component instance.
		this.componentRecords.all.forEach((instance) => {
			instance.queries.add(this);
		});

		// Add query instance to the world's not-query store.
		if (this.componentRecords.forbidden.length > 0) ctx.notQueries.add(this);

		// If the query has an Added modifier, we populate it with its snapshot.
		if (trackingParams.length > 0) {
			for (let i = 0; i < trackingParams.length; i++) {
				const type = trackingParams[i].type;
				const id = trackingParams[i].id;
				const components = trackingParams[i].components;
				const snapshot = ctx.trackingSnapshots.get(id)!;
				const dirtyMask = ctx.dirtyMasks.get(id)!;
				const changedMask = ctx.changedMasks.get(id)!;

				for (const entity of world.entities) {
					let allComponentsMatch = true;

					for (const component of components) {
						const { generationId, bitflag } = component;
						const oldMask = snapshot[generationId][entity] || 0;
						const currentMask = ctx.entityMasks[generationId][entity];

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
			}
		} else {
			// Populate the query immediately.
			if (
				this.componentRecords.required.length > 0 ||
				this.componentRecords.forbidden.length > 0
			) {
				for (let i = 0; i < world.entities.length; i++) {
					const entity = world.entities[i];
					// Skip if the entity is excluded.
					if (entity.has(IsExcluded)) continue;
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
	}

	check(
		world: World,
		entity: number,
		event?: { type: 'add' | 'remove' | 'change'; component: ComponentRecord }
	) {
		const { bitmasks, generations } = this;
		const ctx = world[$internal];

		// If the query is empty, the check fails.
		if (this.componentRecords.all.length === 0) return false;

		for (let i = 0; i < generations.length; i++) {
			const generationId = generations[i];
			const bitmask = bitmasks[i];
			const { required, forbidden, added, removed, changed } = bitmask;
			const entityMask = ctx.entityMasks[generationId][entity];

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
}
