import type { Schema, StoreType } from './types';

export type ValueBuffer = any[] | Float64Array;

/** Field order is fixed when the schema is compiled. AoS occupies one reference slot. */
export function createReadValues(
  schema: Schema,
  type: StoreType
): (index: number, store: any, output: ValueBuffer) => void {
  if (type === 'aos')
    return (index, store, output) => {
      if (output.length) output[0] = store[index >>> 10][index & 1023];
    };
  const body = Object.keys(schema)
    .map((key, i) => `if (output.length > ${i}) output[${i}] = store[${JSON.stringify(key)}][p][o];`)
    .join('\n');
  return new Function(
    'index',
    'store',
    'output',
    `var p = index >>> 10, o = index & 1023; ${body}`
  ) as (index: number, store: any, output: ValueBuffer) => void;
}

export function createWriteValues(
  schema: Schema,
  type: StoreType
): (index: number, store: any, input: ValueBuffer) => void {
  if (type === 'aos')
    return (index, store, input) => {
      store[index >>> 10][index & 1023] = input[0];
    };
  const body = Object.keys(schema)
    .map((key, i) => `store[${JSON.stringify(key)}][p][o] = input[${i}];`)
    .join('\n');
  return new Function(
    'index',
    'store',
    'input',
    `var p = index >>> 10, o = index & 1023; ${body}`
  ) as (index: number, store: any, input: ValueBuffer) => void;
}
