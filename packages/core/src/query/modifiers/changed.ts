import { ComponentRecord } from '../../component/component-record';
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

	return modifier(`changed-${id}`, id, (world, ...components) => components);
}

export function setChanged(world: World, entity: number, component: Component) {
	let record = world[$componentRecords].get(component)!;

	if (!record) {
		record = new ComponentRecord(world, component);
		world[$componentRecords].set(component, record);
	}

	for (const changedMask of world[$changedMasks].values()) {
		if (!changedMask[entity]) {
			changedMask[entity] = new Array();
		}

		changedMask[entity][record.id] = 1;
	}

	// Update queries.
	for (const query of record.queries) {
		// Check if the entity matches the query.
		let match = query.check(world, entity, { type: 'change', component: record });

		if (match) query.add(entity);
		else query.remove(world, entity);
	}

	for (const sub of record.changedSubscriptions) {
		sub(entity);
	}
}
