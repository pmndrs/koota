import { Component } from '../../component/types';
import { universe } from '../../universe/universe';
import { ModifierData } from '../modifier';
import { createTrackingId, setTrackingMasks } from '../utils/tracking-cursor';

export function createRemoved() {
	const id = createTrackingId();

	for (const world of universe.worlds) {
		if (!world) continue;
		setTrackingMasks(world, id);
	}

	return <T extends Component[] = Component[]>(...components: T) =>
		new ModifierData<T>(`removed-${id}`, id, components);
}
