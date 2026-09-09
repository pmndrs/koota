import type { Schema, StoreType } from './types';

/** Numeric pages start as packed doubles so later fractional writes keep their layout. */
export function createStoragePage(numeric: boolean): any[] {
  const page: any[] = numeric ? [0.5] : [undefined];
  for (let i = 1; i < 1024; i++) page[i] = numeric ? 0 : undefined;
  if (numeric) page[0] = 0;
  return page;
}

/** Compile defaults once and write directly into columns without a temporary record. */
export function createInitializeFunction(
  schema: Schema,
  type: StoreType
): (index: number, store: any, value: any) => void {
  if (type === 'tag') return () => {};
  if (type === 'aos')
    return (index, store, value) => {
      const page = (store[index >>> 10] ??= createStoragePage(false));
      page[index & 1023] = value ?? (schema as () => unknown)();
    };
  const body = Object.keys(schema)
    .map((key) => {
      const name = JSON.stringify(key);
      const numeric = typeof (schema as Record<string, unknown>)[key] === 'number';
      return `var column = store[${name}];
      var page = column[p] || (column[p] = makePage(${numeric}));
      page[o] = value != null && Object.hasOwn(value, ${name}) ? value[${name}]
        : typeof schema[${name}] === 'function' ? schema[${name}]() : schema[${name}];`;
    })
    .join('\n');
  return new Function(
    'schema',
    'makePage',
    `return function(index, store, value) {
    var p = index >>> 10, o = index & 1023;
    ${body}
  }`
  )(schema, createStoragePage);
}

/** Clear references without changing the element kind of numeric columns. */
export function createClearFunction(
  schema: Schema,
  type: StoreType
): (index: number, store: any) => void {
  if (type === 'tag') return () => {};
  if (type === 'aos')
    return (index, store) => {
      if (store[index >>> 10]) store[index >>> 10][index & 1023] = undefined;
    };
  const body = Object.keys(schema)
    .map((key) => {
      const name = JSON.stringify(key);
      return `if (store[${name}][p]) store[${name}][p][o] = ${typeof (schema as Record<string, unknown>)[key] === 'number' ? 0 : 'undefined'};`;
    })
    .join('\n');
  return new Function('index', 'store', `var p = index >>> 10, o = index & 1023; ${body}`) as (
    index: number,
    store: any
  ) => void;
}
