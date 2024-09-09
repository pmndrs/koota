import { WORLD_ID_BITS } from '../entity/utils/pack-entity';
import { QueryParameter } from '../query/types';
import { createWorldIndex } from '../world/utils/world-index';
import { World } from '../world/world';

export const universe = {
	worlds: new Array<World>(WORLD_ID_BITS ** 2),
	cachedQueries: new Map<string, QueryParameter[]>(),
	worldIndex: createWorldIndex(),
	reset: () => {
		universe.worlds = new Array<World>(WORLD_ID_BITS ** 2);
		universe.cachedQueries = new Map();
		universe.worldIndex = createWorldIndex();
	},
};
