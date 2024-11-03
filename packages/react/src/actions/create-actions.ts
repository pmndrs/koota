import { World } from '@koota/core';
import { useWorld } from '../world/use-world';

const actionCache = new WeakMap<World, any>();

export function createActions<T extends Record<string, (...args: any[]) => any>>(
	actionSet: (world: World) => T
): (() => T) & { get: (world: World) => T } {
	const getMemoizedActions = (world: World): T => {
		let actions = actionCache.get(world);
		if (!actions) {
			actions = actionSet(world);
			actionCache.set(world, actions);
		}
		return actions;
	};

	return Object.assign(
		() => {
			const world = useWorld();
			return getMemoizedActions(world);
		},
		{
			get: (world: World): T => getMemoizedActions(world),
		}
	);
}
