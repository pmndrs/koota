import type { Schema } from './types';
import type { Store } from './types';
import { isStandardSchema } from './schema';

export function createStore<T extends Schema>(schema: T): Store<T>;
export function createStore(schema: Schema): unknown {
	if (typeof schema === 'function' || isStandardSchema(schema)) {
		return [];
	} else {
		const store: Record<string, unknown[]> = {};

		for (const key in schema) {
			store[key] = [];
		}

		return store;
	}
}
