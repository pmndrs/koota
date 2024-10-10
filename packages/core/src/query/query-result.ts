import { getStore } from '../component/component';
import { Component, Store } from '../component/types';
import { Entity } from '../entity/types';
import { getEntityId } from '../entity/utils/pack-entity';
import { $internal } from '../world/symbols';
import { World } from '../world/world';
import { ModifierData } from './modifier';
import { QueryParameter, QueryResult, SnapshotFromParameters, StoresFromParameters } from './types';

export function createQueryResult<T extends QueryParameter[]>(
	entities: readonly Entity[],
	world: World,
	params: T
): QueryResult<T> {
	const results = Array.from(entities);

	const stores: Store<any>[] = [];
	const components: Component[] = [];

	// Get the components for the query parameters in the order they appear
	// and not the order of they are sorted for the query hash.
	for (const param of params) {
		if (param instanceof ModifierData) {
			// Skip not modifier.
			if (param.type === 'not') continue;

			const modifierComponents = param.components;
			for (const component of modifierComponents) {
				if (component[$internal].isTag) continue; // Skip tags
				components.push(component);
				stores.push(getStore(world, component));
			}
		} else {
			if (param[$internal].isTag) continue; // Skip tags
			components.push(param);
			stores.push(getStore(world, param));
		}
	}

	function updateEach(
		callback: (state: SnapshotFromParameters<T>, entity: Entity, index: number) => void
	) {
		for (let i = 0; i < results.length; i++) {
			const entity = results[i];
			const eid = getEntityId(entity);

			// Create a snapshot for each component in the order they appear in the query params.
			const state = components.map((component, j) => {
				const ctx = component[$internal];
				return ctx.get(eid, stores[j]);
			});

			callback(state as any, entity, i);

			// Skip if the entity has been destroyed.
			if (!world.has(entity)) return;

			// Commit all changes back to the stores.
			for (let j = 0; j < components.length; j++) {
				const component = components[j];
				const ctx = component[$internal];
				ctx.fastSet(eid, stores[j], state[j]);
			}
		}
	}

	function useStores(
		callback: (stores: StoresFromParameters<T>, entities: readonly Entity[]) => void
	) {
		callback(stores as any, results);
	}

	return Object.assign(results, { updateEach, useStores });
}
