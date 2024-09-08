import { QueryParameter } from '../query/types';
import { createWorldIndex } from '../world/utils/world-index';
import { World } from '../world/world';

export const universe = {
	worlds: new Array<World>(),
	cachedQueries: new Map<string, QueryParameter[]>(),
	worldIndex: createWorldIndex(),
	reset: () => {
		universe.worlds.length = 0;
		universe.cachedQueries = new Map();
		universe.worldIndex = createWorldIndex();
	},
};
