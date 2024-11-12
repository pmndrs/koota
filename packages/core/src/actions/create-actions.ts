import { World } from '../world/world';

const actionCache = new WeakMap<World, any>();

export function createActions<T extends Record<string, (...args: any[]) => any>>(
	actionSet: (world: World) => T
): (world: World) => T {
	return (world: World): T => {
		let actions = actionCache.get(world);
		if (!actions) {
			actions = actionSet(world);
			actionCache.set(world, actions);
		}
		return actions;
	};
}
