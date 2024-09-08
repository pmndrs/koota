import { WORLD_ID_BITS } from '../../entity/utils/pack-entity';

let worldCursor = 0;

export function createWorldId() {
	if (worldCursor >= 2 ** WORLD_ID_BITS) {
		throw new Error(`Koota: Too many worlds created. The maximum is ${2 ** WORLD_ID_BITS}.`);
	}

	return worldCursor++;
}
