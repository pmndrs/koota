import { Component } from '../../component/types';
import { universe } from '../../universe/universe';
import { $changedMasks, $componentRecords } from '../../world/symbols';
import { World } from '../../world/world';
import { modifier } from '../modifier';
import { createTrackingId, setTrackingMasks } from '../utils/tracking-cursor';

export function createChanged() {
	const id = createTrackingId();

	for (const world of universe.worlds) {
		setTrackingMasks(world, id);
	}

	return modifier(`changed-${id}`, (world, ...components) => components);
}

export function setChanged(world: World, entity: number, component: Component) {
	const instance = world[$componentRecords].get(component)!;

	for (const changedMask of world[$changedMasks].values()) {
		changedMask[entity][instance.id] = 1;
	}

	// Update queries.
	for (const query of instance.queries) {
		// Check if the entity matches the query.
		let match = query.check(world, entity, { type: 'change', component: instance });

		if (match) {
			query.add(entity);

			for (const sub of query.subscriptions) {
				sub('change', entity);
			}
		} else {
			query.remove(world, entity);
		}
	}
}
