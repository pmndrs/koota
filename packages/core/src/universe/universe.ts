import { QueryParameter } from '../query/types';
import { World } from '../world/world';

export const universe = {
	worlds: new Array<World>(),
	cachedQueries: new Map<string, QueryParameter[]>(),
	reset: () => {
		universe.worlds.length = 0;
	},
};
