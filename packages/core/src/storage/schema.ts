import { warningsEnabled } from '../warning-config';
import type { Schema } from './types';

export function validateSchema(schema: Schema) {
  for (const key in schema) {
    const value: unknown = schema[key as keyof Schema];
    if (Array.isArray(value)) {
      // A tuple needs a fixed stride, so it holds at least one value and only primitives.
      let isTuple = value.length > 0;
      let isNumeric = true;
      for (let i = 0; i < value.length; i++) {
        const element = value[i];
        if ((element !== null && typeof element === 'object') || typeof element === 'function') {
          isTuple = false;
        }
        if (typeof element !== 'number') isNumeric = false;
      }
      if (!isTuple) {
        throw new Error(
          `Koota: ${key} is not a valid tuple. Tuples need at least one value and cannot contain objects, arrays or functions. Use a factory to store other arrays per entity.`
        );
      }
      if (warningsEnabled && !isNumeric) {
        console.warn(
          `Koota: ${key} is a tuple that mixes numbers with other values. Its pages store values generically, so every number written to them allocates. Move the other values to their own field to keep the tuple fast.`
        );
      }
    } else if (value !== null && typeof value === 'object') {
      throw new Error(`Koota: ${key} is an object, which is not supported in traits.`);
    }
  }
}
