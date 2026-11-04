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

/** Compile reference cleanup once. Numeric and boolean columns need no eviction work. */
export function createClearFunction(
  schema: Schema
): ((index: number, store: any) => void) | undefined {
  if (typeof schema === 'function') {
    return (index, store) => {
      store[index >>> 10][index & 1023] = undefined;
    };
  }
  const writes: string[] = [];
  for (const key in schema) {
    const field = schema[key];
    const column = `store[${JSON.stringify(key)}][p]`;
    if (Array.isArray(field)) {
      for (let i = 0; i < field.length; i++) {
        if (typeof field[i] !== 'number' && typeof field[i] !== 'boolean') {
          writes.push(`${column}[o * ${field.length} + ${i}] = undefined;`);
        }
      }
    } else if (typeof field !== 'number' && typeof field !== 'boolean') {
      writes.push(`${column}[o] = undefined;`);
    }
  }
  if (writes.length === 0) return;
  return new Function(
    'index',
    'store',
    `var p = index >>> 10, o = index & 1023; ${writes.join(' ')}`
  ) as (index: number, store: any) => void;
}

/** One filled page per default value, sliced for every new page. */
const pageTemplates = new Map<unknown, unknown[]>();

/**
 * Create a full SoA page filled with the default so V8 keeps it packed. Tuples interleave
 * their elements and factory defaults start undefined. The template starts from Array.of
 * because a literal site shares its elements kind with every array made there.
 */
export function createPage(field: unknown): unknown[] {
  let template = pageTemplates.get(field);
  if (template === undefined) {
    template = Array.of<unknown>();
    if (Array.isArray(field)) {
      for (let i = 0; i < PAGE_SIZE; i++) {
        for (let c = 0; c < field.length; c++) template.push(field[c]);
      }
    } else {
      const value = typeof field === 'function' ? undefined : field;
      for (let i = 0; i < PAGE_SIZE; i++) template.push(value);
    }
    pageTemplates.set(field, template);
  }
  return template.slice();
}
