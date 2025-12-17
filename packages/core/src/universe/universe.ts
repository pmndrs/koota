import type { QueryRef } from '../query/types';
import type { World } from '../world';
import { createWorldIndex } from '../world/utils/world-index';

export const universe = {
	worlds: [] as (World | null)[],
	cachedQueries: new Map<string, QueryRef<any>>(),
	worldIndex: createWorldIndex(),
	reset: () => {
		universe.worlds = [];
		universe.cachedQueries = new Map();
		universe.worldIndex = createWorldIndex();
	},
};
