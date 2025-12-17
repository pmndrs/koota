import type { World } from '../world';
import type { ActionGetter, ActionInitializer, Actions } from './types';

const actionCache = new WeakMap<World, Map<(...args: any[]) => any, Actions>>();

export function createActions<
	T extends Actions,
	C extends Record<string, unknown> | undefined = undefined
>(initializer: ActionInitializer<T, C>): ActionGetter<T, C> {
	return ((world: World, context?: C): T => {
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
	}) as ActionGetter<T, C>;
}
