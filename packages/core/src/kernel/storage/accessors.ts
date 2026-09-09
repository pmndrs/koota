import type { Schema } from './types';
import { createStoragePage } from './initialize';

function compileSet(schema: Schema, mode: 'partial' | 'full' | 'changed') {
  const body = Object.keys(schema)
    .map((key) => {
      const name = JSON.stringify(key);
      const numeric = typeof (schema as Record<string, unknown>)[key] === 'number';
      const write =
        mode === 'changed'
          ? `if (page[o] !== value[${name}]) { page[o] = value[${name}]; changed = true; }`
          : `page[o] = value[${name}];`;
      return `${mode === 'partial' ? `if (${name} in value) {` : ''}
      var column = store[${name}];
      var page = column[p] || (column[p] = makePage(${numeric}));
      ${write}
      ${mode === 'partial' ? '}' : ''}`;
    })
    .join('\n');
  return new Function(
    'makePage',
    `return function(index, store, value) {
    var p = index >>> 10, o = index & 1023, changed = false;
    ${body}
    return changed;
  }`
  )(createStoragePage);
}

function createSoASetFunction(schema: Schema) {
  return compileSet(schema, 'partial');
}
function createSoAFastSetFunction(schema: Schema) {
  return compileSet(schema, 'full');
}
function createSoAFastSetChangeFunction(schema: Schema) {
  return compileSet(schema, 'changed');
}

function createSoAGetFunction(schema: Schema) {
  const fields = Object.keys(schema)
    .map((key) => {
      const name = JSON.stringify(key);
      return `[${name}]: store[${name}][p][o]`;
    })
    .join(',');
  return new Function(
    'index',
    'store',
    `var p = index >>> 10, o = index & 1023; return {${fields}};`
  );
}

function createAoSSetFunction(_schema: Schema) {
  return (index: number, store: any, value: any) => {
    const page = (store[index >>> 10] ??= createStoragePage(false));
    page[index & 1023] = value;
  };
}

function createAoSFastSetChangeFunction(_schema: Schema) {
  return (index: number, store: any, value: any) => {
    const page = (store[index >>> 10] ??= createStoragePage(false));
    const offset = index & 1023;
    if (page[offset] === value) return false;
    page[offset] = value;
    return true;
  };
}

function createAoSGetFunction(_schema: Schema) {
  return (index: number, store: any) => store[index >>> 10]?.[index & 1023];
}

const noop = () => {};
const createTagNoop = () => noop;

export const createSetFunction = {
  soa: createSoASetFunction,
  aos: createAoSSetFunction,
  tag: createTagNoop,
};
export const createFastSetFunction = {
  soa: createSoAFastSetFunction,
  aos: createAoSSetFunction,
  tag: createTagNoop,
};
export const createFastSetChangeFunction = {
  soa: createSoAFastSetChangeFunction,
  aos: createAoSFastSetChangeFunction,
  tag: createTagNoop,
};
export const createGetFunction = {
  soa: createSoAGetFunction,
  aos: createAoSGetFunction,
  tag: createTagNoop,
};
