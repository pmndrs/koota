import { World } from '../world/world';

const actionCache = new WeakMap<World, Map<Function, any>>();

export function createActions<T extends Record<string, (...args: any[]) => any>>(
	actionSet: (world: World) => T
): (world: World) => T {
	return (world: World): T => {
		let worldCache = actionCache.get(world);
		if (!worldCache) {
			worldCache = new Map();
			actionCache.set(world, worldCache);
		}

		let actions = worldCache.get(actionSet);
		if (!actions) {
			actions = actionSet(world);
			worldCache.set(actionSet, actions);
		}
		return actions;
	};
}
