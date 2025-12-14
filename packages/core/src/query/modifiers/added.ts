import { $internal } from '../../common';
import { isRelation } from '../../relation/relation';
import type { Trait, TraitOrRelation } from '../../trait/types';
import { universe } from '../../universe/universe';
import { createModifier } from '../modifier';
import type { ModifierData } from '../types';
import { createTrackingId, setTrackingMasks } from '../utils/tracking-cursor';

export function createAdded() {
	const id = createTrackingId();

	for (const world of universe.worlds) {
		if (!world) continue;
		setTrackingMasks(world, id);
	}

	return <T extends TraitOrRelation[] = TraitOrRelation[]>(
		...inputs: T
	): ModifierData<Trait[], `added-${number}`> => {
		const traits = inputs.map((input) => (isRelation(input) ? input[$internal].trait : input));
		return createModifier(`added-${id}`, id, traits);
	};
}
