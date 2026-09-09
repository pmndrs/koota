import type { Schema } from './types';
import type { Store } from './types';

export function createStore<T extends Schema>(schema: T): Store<T>;
export function createStore(schema: Schema): unknown {
  if (typeof schema === 'function') {
    return [];
  } else {
    const store: Record<string, unknown[]> = {};

    for (const key of Object.keys(schema)) {
      Object.defineProperty(store, key, {
        value: [],
        writable: true,
        enumerable: true,
        configurable: true,
      });
    }

    return store;
  }
}
