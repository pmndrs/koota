import type { WorldContext } from '../world';
import { createPage } from './stores';
import type { Schema, StoreType } from './types';

// Accessors share the (ctx, index, store) prefix so a trait with custom storage can replace any of them.
export type AddAccessor = (ctx: WorldContext, index: number, store: any, value?: any) => void;
export type SetAccessor = (ctx: WorldContext, index: number, store: any, value: any) => boolean;
export type GetAccessor = (ctx: WorldContext, index: number, store: any) => any;
export type GetIntoAccessor = (ctx: WorldContext, index: number, store: any, out: any) => any;
export type RemoveAccessor = (ctx: WorldContext, index: number, store: any) => void;

/** A tuple field stores `stride` interleaved values per entity. Scalar fields have stride 0. */
function getStride(schema: Schema, key: string): number {
  const field = (schema as Record<string, unknown>)[key];
  return Array.isArray(field) ? field.length : 0;
}

/** Unrolls a statement for each tuple element, since the stride is fixed per trait. */
function unroll(stride: number, statement: (c: number) => string): string {
  return Array.from({ length: stride }, (_, c) => statement(c)).join(' ');
}

// Locals are suffixed with the key index. Keys only appear as property names, so they cannot collide.
// Set runs only for members, so add has already created their pages.
function createSoASetFunction(schema: Schema): SetAccessor {
  const keys = Object.keys(schema);
  const writes = keys
    .map((key, k) => {
      const stride = getStride(schema, key);
      if (stride === 0) {
        return `if ('${key}' in value && store.${key}[p][o] !== value.${key}) { store.${key}[p][o] = value.${key}; changed = true; }`;
      }
      // Diff each element so writing an equal tuple reports no change.
      return `if ('${key}' in value) { var c${k} = store.${key}[p], v${k} = value.${key}, b${k} = o * ${stride}; ${unroll(
        stride,
        (c) =>
          `if (c${k}[b${k} + ${c}] !== v${k}[${c}]) { c${k}[b${k} + ${c}] = v${k}[${c}]; changed = true; }`
      )} }`;
    })
    .join('\n    ');

  return new Function(
    'ctx',
    'index',
    'store',
    'value',
    `
        var p = index >>> 10, o = index & 1023;
        var changed = false;
        ${writes}
        return changed;
        `
  ) as SetAccessor;
}

/** Creates the entity's pages if needed, then writes every key from value or its schema default. */
function createSoAAddFunction(schema: Schema): AddAccessor {
  const keys = Object.keys(schema);
  // Pages for every key are created together, so the first key stands in for all of them.
  const pages = keys
    .map((key) =>
      getStride(schema, key)
        ? `store.${key}[p] = createPage(schema.${key});`
        : `store.${key}[p] = [];`
    )
    .join(' ');
  const writes = keys
    .map((key, k) => {
      const field = (schema as Record<string, unknown>)[key];
      const source = `value != null && '${key}' in value ? value.${key}`;
      const stride = getStride(schema, key);
      if (stride === 0) {
        const fallback = typeof field === 'function' ? `schema.${key}()` : `schema.${key}`;
        return `store.${key}[p][o] = ${source} : ${fallback};`;
      }
      return `var c${k} = store.${key}[p], v${k} = ${source} : schema.${key}, b${k} = o * ${stride}; ${unroll(
        stride,
        (c) => `c${k}[b${k} + ${c}] = v${k}[${c}];`
      )}`;
    })
    .join('\n    ');

  return new Function(
    'schema',
    'createPage',
    `
      return function (ctx, index, store, value) {
        var p = index >>> 10, o = index & 1023;
        if (!store.${keys[0]}[p]) { ${pages} }
        ${writes}
      };
      `
  )(schema, createPage) as AddAccessor;
}

/** Returns a snapshot. Tuples are copied into fresh arrays, so the result never aliases storage. */
function createSoAGetFunction(schema: Schema): GetAccessor {
  const keys = Object.keys(schema);
  const pages = keys
    .map((key, k) => {
      const stride = getStride(schema, key);
      return stride === 0 ? '' : `var c${k} = store.${key}[p], b${k} = o * ${stride};`;
    })
    .join(' ');
  const fields = keys.map((key, k) => {
    const stride = getStride(schema, key);
    if (stride === 0) return `${key}: store.${key}[p][o]`;
    return `${key}: [${Array.from({ length: stride }, (_, c) => `c${k}[b${k} + ${c}]`).join(', ')}]`;
  });

  return new Function(
    'ctx',
    'index',
    'store',
    `
        var p = index >>> 10, o = index & 1023;
        ${pages}
        return { ${fields.join(', ')} };
        `
  ) as GetAccessor;
}

/**
 * Fills a caller-owned record and returns it. Tuples are copied into the arrays it already holds,
 * so nothing is allocated. Kept apart from get so snapshot reads stay as small as possible.
 */
function createSoAGetIntoFunction(schema: Schema): GetIntoAccessor {
  const writes = Object.keys(schema)
    .map((key, k) => {
      const stride = getStride(schema, key);
      if (stride === 0) return `out.${key} = store.${key}[p][o];`;
      return `var c${k} = store.${key}[p], b${k} = o * ${stride}, d${k} = out.${key}; ${unroll(
        stride,
        (c) => `d${k}[${c}] = c${k}[b${k} + ${c}];`
      )}`;
    })
    .join(' ');

  return new Function(
    'ctx',
    'index',
    'store',
    'out',
    `
        var p = index >>> 10, o = index & 1023;
        ${writes}
        return out;
        `
  ) as GetIntoAccessor;
}

function createAoSSetFunction(_schema: Schema): SetAccessor {
  return (_ctx, index, store, value) => {
    const page = store[index >>> 10],
      o = index & 1023;
    if (value === page[o]) return false;
    page[o] = value;
    return true;
  };
}

function createAoSAddFunction(schema: Schema): AddAccessor {
  return (_ctx, index, store, value) => {
    const p = index >>> 10;
    if (!store[p]) store[p] = [];
    store[p][index & 1023] = value ?? (schema as () => unknown)();
  };
}

function createAoSGetFunction(_schema: Schema): GetAccessor {
  return (_ctx, index, store) => store[index >>> 10][index & 1023];
}

const noop = () => {};

export const createAddFunction: Record<StoreType, (schema: Schema) => AddAccessor> = {
  soa: createSoAAddFunction,
  aos: createAoSAddFunction,
  tag: () => noop,
};

export const createSetFunction: Record<StoreType, (schema: Schema) => SetAccessor> = {
  soa: createSoASetFunction,
  aos: createAoSSetFunction,
  tag: () => () => false,
};

export const createGetFunction: Record<StoreType, (schema: Schema) => GetAccessor> = {
  soa: createSoAGetFunction,
  aos: createAoSGetFunction,
  tag: () => noop,
};

// AoS records are the stored values themselves, so they have nothing to copy into out.
export const createGetIntoFunction: Record<StoreType, (schema: Schema) => GetIntoAccessor> = {
  soa: createSoAGetIntoFunction,
  aos: createAoSGetFunction,
  tag: () => noop,
};
