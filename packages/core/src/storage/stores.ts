import type { Definition, InferDefinition, Store } from './types';

export function createStore<D extends Definition>(definition: D): Store<InferDefinition<D>>;
export function createStore(definition: Definition): unknown {
    if (typeof definition === 'function') {
        return [];
    } else {
        const store: Record<string, unknown[]> = {};

        for (const key in definition) {
            store[key] = [];
        }

        return store;
    }
}
