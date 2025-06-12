import { WORLD_ID_BITS } from '../entity/utils/pack-entity';
import type { QueryParameter } from '../query/types';
import { createWorldIndex } from '../world/utils/world-index';
import type { World } from '../world/world';

export const universe = {
	worlds: Array.from({ length: WORLD_ID_BITS ** 2 }, () => null as WeakRef<World> | null),
	cachedQueries: new Map<string, QueryParameter[]>(),
	worldIndex: createWorldIndex(),
	reset: () => {
		universe.worlds = Array.from(
			{ length: WORLD_ID_BITS ** 2 },
			() => null as WeakRef<World> | null
		);
		universe.cachedQueries = new Map();
		universe.worldIndex = createWorldIndex();
	},
};
