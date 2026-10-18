import { PAGE_SIZE } from '../entity/utils/pack-entity';
import type { Schema } from './types';
import type { Store } from './types';

export function createStore<T extends Schema>(schema: T): Store<T>;
export function createStore(schema: Schema): unknown {
  if (typeof schema === 'function') {
    return [];
  } else {
    const store: Record<string, unknown[]> = {};

    for (const key in schema) {
      store[key] = [];
    }

    return store;
  }
}

/**
 * Create one page of a SoA column. Tuple pages interleave each entity's elements
 * and start filled with the default, so the array stays packed.
 */
export function createPage(field: unknown): unknown[] {
  if (!Array.isArray(field)) return [];
  const page: unknown[] = [];
  for (let i = 0; i < PAGE_SIZE; i++) {
    for (let c = 0; c < field.length; c++) page.push(field[c]);
  }
  return page;
}
