import { World } from '../world/world';
import { Actions, ActionInitializer, ActionGetter } from './types';

const actionCache = new WeakMap<World, Map<Function, Actions>>();

export function createActions<T extends Actions, C extends Record<string, unknown> = never>(
	initializer: ActionInitializer<T, C>
): ActionGetter<T, C> {
	return (world: World, context?: C): T => {
		let worldCache = actionCache.get(world);

		if (!worldCache) {
			worldCache = new Map();
			actionCache.set(world, worldCache);
		}

		let actions = worldCache.get(initializer);
		if (!actions) {
			actions = initializer(world, context ?? ({} as C));
			worldCache.set(initializer, actions);
		}
		return actions as T;
	};
}
