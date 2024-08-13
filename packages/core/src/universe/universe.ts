import { World } from '../world/world';

export const universe = {
	worlds: new Array<World>(),
	reset: () => {
		universe.worlds.length = 0;
	},
};
