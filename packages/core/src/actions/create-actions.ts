import { $internal } from '../common';
import type { World } from '../world';
import type { ActionsRef, ActionsDefinition, ActionsInstance } from './types';

let actionsId = 0;

export function defineActions<T extends ActionsInstance>(
	initializer: ActionsDefinition<T>
): ActionsRef<T> {
	const id = actionsId++;

	const getter = Object.assign(
		(world: World): T => {
			const ctx = world[$internal];

			// Try array lookup first (faster)
			let actions = ctx.actionInstances[id];

			if (!actions) {
				// Create and cache actions instance
				actions = initializer(world);

				// Ensure array is large enough
				if (id >= ctx.actionInstances.length) {
					ctx.actionInstances.length = id + 1;
				}
				ctx.actionInstances[id] = actions;
			}

			return actions as T;
		},
		{
			initializer,
		}
	) as ActionsRef<T>;

	// Add public read-only id property
	Object.defineProperty(getter, 'id', {
		value: id,
		writable: false,
		enumerable: true,
		configurable: false,
	});

	return getter;
}

/** @deprecated Use defineActions instead */
export const createActions = defineActions;
