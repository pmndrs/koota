import { $internal } from '../../common';
import { World } from '../../world/world';
import { ExtractStore, Trait } from '../types';

export /* @inline @pure */ function getStore<C extends Trait = Trait>(
	world: World,
	trait: C
): ExtractStore<C> {
	const ctx = world[$internal];
	const data = ctx.traitData.get(trait)!;
	return data.store as ExtractStore<C>;
}
