import { $internal } from '../common';
import { Entity } from '../entity/types';
import { getEntityId } from '../entity/utils/pack-entity';
import { getStore } from '../trait/trait';
import { Store, Trait } from '../trait/types';
import { shallowEqual } from '../utils/shallow-equal';
import { World } from '../world/world';
import { ModifierData } from './modifier';
import { setChanged } from './modifiers/changed';
import { Query } from './query';
import {
	InstancesFromParameters,
	QueryParameter,
	QueryResult,
	QueryResultOptions,
	StoresFromParameters,
} from './types';

export function createQueryResult<T extends QueryParameter[]>(
	query: Query,
	world: World,
	params: T
): QueryResult<T> {
	query.commitRemovals(world);
	const entities = query.entities.dense.slice() as Entity[];
	// Clear so it can accumulate again.
	if (query.isTracking) query.entities.clear();

	const stores: Store<any>[] = [];
	const traits: Trait[] = [];

	// Get the traits for the query parameters in the order they are defined
	// and not the order they are sorted for the query hash.
	getQueryStores<T>(params, traits, stores, world);

	const results = Object.assign(entities, {
		updateEach(
			callback: (state: InstancesFromParameters<T>, entity: Entity, index: number) => void,
			options: QueryResultOptions = { changeDetection: 'auto' }
		) {
			const state = new Array(traits.length);

			// Inline all three permutations of updateEach for performance.
			if (options.changeDetection === 'auto') {
				const changedPairs: [Entity, Trait][] = [];
				const atomicSnapshots: any[] = [];
				const trackedIndices: number[] = [];
				const untrackedIndices: number[] = [];

				// Get the traits that are being tracked for changes.
				for (let i = 0; i < traits.length; i++) {
					const trait = traits[i];
					const hasTracked = world[$internal].trackedTraits.has(trait);
					const hasChanged = query.hasChangedModifiers && query.changedTraits.has(trait);

					if (hasTracked || hasChanged) trackedIndices.push(i);
					else untrackedIndices.push(i);
				}

				for (let i = 0; i < entities.length; i++) {
					const entity = entities[i];
					const eid = getEntityId(entity);

					// Create a snapshot for each trait in the order they appear in the query params.
					for (let j = 0; j < traits.length; j++) {
						const trait = traits[j];
						const ctx = trait[$internal];
						const value = ctx.get(eid, stores[j]);
						state[j] = value;
						atomicSnapshots[j] = ctx.type === 'aos' ? { ...value } : null;
					}

					callback(state as any, entity, i);

					// Skip if the entity has been destroyed.
					if (!world.has(entity)) continue;

					// Commit all changes back to the stores for tracked traits.
					for (let j = 0; j < trackedIndices.length; j++) {
						const index = trackedIndices[j];
						const trait = traits[index];
						const ctx = trait[$internal];
						const newValue = state[index];
						const store = stores[index];

						let changed = false;
						if (ctx.type === 'aos') {
							changed = ctx.fastSetWithChangeDetection(eid, store, newValue);
							if (!changed) {
								changed = !shallowEqual(newValue, atomicSnapshots[index]);
							}
						} else {
							changed = ctx.fastSetWithChangeDetection(eid, store, newValue);
						}

						// Collect changed traits.
						if (changed) changedPairs.push([entity, trait] as const);
					}

					// Commit all changes back to the stores for untracked traits.
					for (let j = 0; j < untrackedIndices.length; j++) {
						const index = untrackedIndices[j];
						const trait = traits[index];
						const ctx = trait[$internal];
						const store = stores[index];
						ctx.fastSet(eid, store, state[index]);
					}
				}

				// Trigger change events for each entity that was modified.
				for (let i = 0; i < changedPairs.length; i++) {
					const [entity, trait] = changedPairs[i];
					setChanged(world, entity, trait);
				}
			} else if (options.changeDetection === 'always') {
				const changedPairs: [Entity, Trait][] = [];
				const atomicSnapshots: any[] = [];

				for (let i = 0; i < entities.length; i++) {
					const entity = entities[i];
					const eid = getEntityId(entity);

					// Create a snapshot for each trait in the order they appear in the query params.
					for (let j = 0; j < traits.length; j++) {
						const trait = traits[j];
						const ctx = trait[$internal];
						const value = ctx.get(eid, stores[j]);
						state[j] = value;
						atomicSnapshots[j] = ctx.type === 'aos' ? { ...value } : null;
					}

					callback(state as any, entity, i);

					// Skip if the entity has been destroyed.
					if (!world.has(entity)) continue;

					// Commit all changes back to the stores.
					for (let j = 0; j < traits.length; j++) {
						const trait = traits[j];
						const ctx = trait[$internal];
						const newValue = state[j];

						let changed = false;
						if (ctx.type === 'aos') {
							changed = ctx.fastSetWithChangeDetection(eid, stores[j], newValue);
							if (!changed) {
								changed = !shallowEqual(newValue, atomicSnapshots[j]);
							}
						} else {
							changed = ctx.fastSetWithChangeDetection(eid, stores[j], newValue);
						}

						// Collect changed traits.
						if (changed) changedPairs.push([entity, trait] as const);
					}
				}

				// Trigger change events for each entity that was modified.
				for (let i = 0; i < changedPairs.length; i++) {
					const [entity, trait] = changedPairs[i];
					setChanged(world, entity, trait);
				}
			} else if (options.changeDetection === 'never') {
				for (let i = 0; i < entities.length; i++) {
					const entity = entities[i];
					const eid = getEntityId(entity);

					// Create a snapshot for each trait in the order they appear in the query params.
					for (let j = 0; j < traits.length; j++) {
						const trait = traits[j];
						const ctx = trait[$internal];
						state[j] = ctx.get(eid, stores[j]);
					}

					callback(state as any, entity, i);

					// Skip if the entity has been destroyed.
					if (!world.has(entity)) continue;

					// Commit all changes back to the stores.
					for (let j = 0; j < traits.length; j++) {
						const trait = traits[j];
						const ctx = trait[$internal];
						ctx.fastSet(eid, stores[j], state[j]);
					}
				}
			}

			return results;
		},

		useStores(callback: (stores: StoresFromParameters<T>, entities: readonly Entity[]) => void) {
			callback(stores as any, entities);
			return results;
		},

		select<U extends QueryParameter[]>(...params: U): QueryResult<U> {
			traits.length = 0;
			stores.length = 0;
			getQueryStores(params, traits, stores, world);
			return results as unknown as QueryResult<U>;
		},

		sort(callback: (a: Entity, b: Entity) => number = (a, b) => a.id() - b.id()): QueryResult<T> {
			Array.prototype.sort.call(entities, callback);
			return results;
		},
	});

	return results;
}

function getQueryStores<T extends QueryParameter[]>(
	params: T,
	traits: Trait[],
	stores: Store<any>[],
	world: World
) {
	for (let i = 0; i < params.length; i++) {
		const param = params[i];

		if (param instanceof ModifierData) {
			// Skip not modifier.
			if (param.type === 'not') continue;

			const modifierTraits = param.traits;
			for (const trait of modifierTraits) {
				if (trait[$internal].isTag) continue; // Skip tags
				traits.push(trait);
				stores.push(getStore(world, trait));
			}
		} else {
			if (param[$internal].isTag) continue; // Skip tags
			traits.push(param);
			stores.push(getStore(world, param));
		}
	}
}
