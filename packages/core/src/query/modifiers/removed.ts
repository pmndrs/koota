import type { Trait } from '../../trait/types';
import type { ModifierData } from '../types';
import { universe } from '../../universe/universe';
import { createModifier } from '../modifier';
import { createTrackingId, setTrackingMasks } from '../utils/tracking-cursor';

export function createRemoved() {
	const id = createTrackingId();

	for (const world of universe.worlds) {
		if (!world) continue;
		setTrackingMasks(world, id);
	}

	return <T extends Trait[] = Trait[]>(...traits: T): ModifierData<T, `removed-${number}`> => {
		return createModifier(`removed-${id}`, id, traits);
	};
}
