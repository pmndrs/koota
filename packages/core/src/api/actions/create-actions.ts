import { $internal } from '../symbols';
import type { World } from '../world/types';
import type { ActionRecord, Actions, ActionsInitializer } from './types';

let actionsId = 0;

export function createActions<T extends ActionRecord>(initializer: ActionsInitializer<T>): Actions<T> {
  const id = actionsId++;

  const actions = Object.assign(
    (world: World): T => {
      const instances = world[$internal].actionInstances;
      let instance = instances[id];
      if (!instance) {
        instance = initializer(world);
        if (id >= instances.length) instances.length = id + 1;
        instances[id] = instance;
      }
      return instance as T;
    },
    { initializer }
  ) as Actions<T>;

  Object.defineProperty(actions, 'id', { value: id, writable: false, enumerable: true, configurable: false });
  return actions;
}
