import type { QueryParameter } from '../query/types';
import { createWorldIndex } from '../world/utils/world-index';
import type { World } from '../world/world';

export const universe = {
	worlds: [] as (World | null)[],
	cachedQueries: new Map<string, QueryParameter[]>(),
	worldIndex: createWorldIndex(),
	reset: () => {
		universe.worlds = [];
		universe.cachedQueries = new Map();
		universe.worldIndex = createWorldIndex();
	},
};
