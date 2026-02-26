import type { Schema } from './types';

export function createStore(schema: Schema): unknown {
    switch (schema.kind) {
        case 'aos':
            return [];
        case 'tag':
            return {};
        case 'soa': {
            const store: Record<string, unknown[]> = {};
            for (const key in schema.fields) {
                store[key] = [];
            }
            return store;
        }
    }
}
