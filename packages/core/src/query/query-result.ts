import { getIndex } from '..';
import { getStore } from '../component/component';
import { Component, Store } from '../component/types';
import { Entity } from '../entity/types';
import { $internal } from '../world/symbols';
import { World } from '../world/world';
import { isModifier } from './modifier';
import { $modifier } from './symbols';
import { QueryParameter, QueryResult } from './types';

export function createQueryResult(
	entities: readonly Entity[],
	world: World,
	params: QueryParameter[]
): QueryResult {
	const results = Array.from(entities);

	const stores: Store<any>[] = [];
	const components: Component[] = [];

	// Get the components for the query parameters in the order they appear
	// and not the order of they are sorted for the query hash.
	for (const param of params) {
		if (isModifier(param)) {
			// Skip not modifier.
			if (param[$modifier] === 'not') continue;

			const modifierComponents = param();
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
		callback: (state: Record<string, any>[], entity: Entity, index: number) => void
	) {
		for (let i = 0; i < results.length; i++) {
			const entity = results[i];
			const index = getIndex(entity);

			// Create a snapshot for each component in the order they appear in the query params.
			const state = components.map((component, j) => {
				const ctx = component[$internal];
				return ctx.get(index, stores[j]);
			});

			callback(state, entity, i);

			// Skip if the entity has been destroyed.
			if (!world.has(entity)) return;

			// Commit all changes back to the stores.
			for (let j = 0; j < components.length; j++) {
				const component = components[j];
				const ctx = component[$internal];
				ctx.fastSet(index, stores[j], state[j]);
			}
		}
	}

	return Object.assign(results, { updateEach });
}
