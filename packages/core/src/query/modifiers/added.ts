import { Trait } from '../../trait/types';
import { universe } from '../../universe/universe';
import { ModifierData } from '../modifier';
import { createTrackingId, setTrackingMasks } from '../utils/tracking-cursor';

export function createAdded() {
	const id = createTrackingId();

	for (const world of universe.worlds) {
		if (!world) continue;
		setTrackingMasks(world, id);
	}

	return <T extends Trait[] = Trait[]>(...traits: T) =>
		new ModifierData<T>(`added-${id}`, id, traits);
}
