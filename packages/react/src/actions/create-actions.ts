import { World } from '@koota/core';
import { useWorld } from '../world/use-world';

export function createActions<T extends Record<string, (...args: any[]) => any>>(
	actionSet: (world: World) => T
): () => T {
	const actionFactory = Object.assign(actionSet, {
		get: (world: World): T => actionSet(world),
	});

	return () => {
		const world = useWorld();
		return actionFactory.get(world);
	};
}
