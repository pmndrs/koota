import { World } from '@koota/core';
import { useWorld } from '../world/use-world';

export function createActions<T extends Record<string, (...args: any[]) => any>>(
	actionSet: (world: World) => T
): (() => T) & { get: (world: World) => T } {
	return Object.assign(
		() => {
			const world = useWorld();
			return actionSet(world);
		},
		{
			get: (world: World): T => actionSet(world),
		}
	);
}
