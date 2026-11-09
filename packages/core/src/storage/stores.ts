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

/** One filled page per default value, shared by creation and growth. */
const pageTemplates = new Map<unknown, unknown[]>();

/**
 * The template for a default, built on first use. Array.of gives each template its own elements
 * kind instead of sharing a literal site. Factory defaults all start undefined and share one
 * template, since keying by the factory would keep whatever it closes over alive, such as a world.
 */
function getPageTemplate(field: unknown): unknown[] {
  const key = typeof field === 'function' ? undefined : field;
  let template = pageTemplates.get(key);
  if (template === undefined) {
    template = Array.of<unknown>();
    if (Array.isArray(key)) {
      for (let i = 0; i < PAGE_SIZE; i++) {
        for (let c = 0; c < key.length; c++) template.push(key[c]);
      }
    } else {
      for (let i = 0; i < PAGE_SIZE; i++) template.push(key);
    }
    pageTemplates.set(key, template);
  }
  return template;
}

/** Create a packed column with capacity of 1..PAGE_SIZE entity slots, interleaving tuples. */
export function createPage(field: unknown, capacity = PAGE_SIZE): unknown[] {
  return getPageTemplate(field).slice(0, capacity * (Array.isArray(field) ? field.length : 1));
}

/**
 * Extend existing columns to at most PAGE_SIZE entity slots, preserving their identity and values.
 * Every field must already have a column at pageId with the same entity capacity.
 */
export function growPages(
  schema: Record<string, unknown>,
  store: Record<string, unknown[][]>,
  pageId: number,
  capacity: number
) {
  for (const key in schema) {
    const field = schema[key];
    const page = store[key][pageId];
    const template = getPageTemplate(field);
    const end = capacity * (Array.isArray(field) ? field.length : 1);
    for (let i = page.length; i < end; i++) page.push(template[i]);
  }
}
