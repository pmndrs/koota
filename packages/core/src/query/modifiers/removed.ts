import { universe } from '../../universe/universe';
import { modifier } from '../modifier';
import { createTrackingId, setTrackingMasks } from '../utils/tracking-cursor';

export function createRemoved() {
	const id = createTrackingId();

	for (const world of universe.worlds) {
		setTrackingMasks(world, id);
	}

	return modifier(`removed-${id}`, id, (world, ...components) => components);
}
