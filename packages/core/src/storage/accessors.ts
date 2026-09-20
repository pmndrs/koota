import type { WorldContext } from '../world';
import type { Schema, StoreType } from './types';

// Accessors share the (ctx, index, store) prefix so a trait with custom storage can replace any of them.
export type AddAccessor = (ctx: WorldContext, index: number, store: any, value?: any) => void;
export type SetAccessor = (ctx: WorldContext, index: number, store: any, value: any) => boolean;
export type GetAccessor = (ctx: WorldContext, index: number, store: any) => any;
export type RemoveAccessor = (ctx: WorldContext, index: number, store: any) => void;

function createSoASetFunction(schema: Schema): SetAccessor {
  const keys = Object.keys(schema);
  // Pages for every key are created together, so the first key stands in for all of them.
  const ensurePages = keys.map((key) => `store.${key}[p] = [];`).join(' ');
  const writes = keys
    .map(
      (key) =>
        `if ('${key}' in value && store.${key}[p][o] !== value.${key}) { store.${key}[p][o] = value.${key}; changed = true; }`
    )
    .join('\n    ');

  return new Function(
    'ctx',
    'index',
    'store',
    'value',
    `
        var p = index >>> 10, o = index & 1023;
        if (!store.${keys[0]}[p]) { ${ensurePages} }
        var changed = false;
        ${writes}
        return changed;
        `
  ) as SetAccessor;
}

/** Writes every key from value, falling back to the schema default. */
function createSoAAddFunction(schema: Schema): AddAccessor {
  const keys = Object.keys(schema);
  const ensurePages = keys.map((key) => `store.${key}[p] = [];`).join(' ');
  const writes = keys
    .map((key) => {
      const fallback =
        typeof (schema as Record<string, unknown>)[key] === 'function'
          ? `schema.${key}()`
          : `schema.${key}`;
      return `store.${key}[p][o] = value != null && '${key}' in value ? value.${key} : ${fallback};`;
    })
    .join('\n    ');

  return new Function(
    'schema',
    `
      return function (ctx, index, store, value) {
        var p = index >>> 10, o = index & 1023;
        if (!store.${keys[0]}[p]) { ${ensurePages} }
        ${writes}
      };
      `
  )(schema) as AddAccessor;
}

function createSoAGetFunction(schema: Schema): GetAccessor {
  const keys = Object.keys(schema);
  const objectLiteral = `{ ${keys.map((key) => `${key}: store.${key}[p][o]`).join(', ')} }`;

  return new Function(
    'ctx',
    'index',
    'store',
    `
        var p = index >>> 10, o = index & 1023;
        return ${objectLiteral};
        `
  ) as GetAccessor;
}

function createAoSSetFunction(_schema: Schema): SetAccessor {
  return (_ctx, index, store, value) => {
    const p = index >>> 10,
      o = index & 1023;
    if (!store[p]) store[p] = [];
    if (value === store[p][o]) return false;
    store[p][o] = value;
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
  return (_ctx, index, store) => {
    const page = store[index >>> 10];
    return page ? page[index & 1023] : undefined;
  };
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
