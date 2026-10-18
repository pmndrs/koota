import { warningsEnabled } from '../warning-config';
import type { Schema, StoreType } from './types';

/**
 * Get default values from a schema.
 * Returns null for tags (empty schemas) or if no defaults exist.
 */
/* @inline @pure */ export function getSchemaDefaults(
  schema: Record<string, any> | (() => unknown),
  type: StoreType
): Record<string, any> | null {
  if (type === 'aos') {
    return typeof schema === 'function' ? (schema() as Record<string, any>) : null;
  }

  if (!schema || typeof schema === 'function' || Object.keys(schema).length === 0) return null;

  const defaults: Record<string, any> = {};
  for (const key in schema) {
    if (typeof schema[key] === 'function') {
      defaults[key] = schema[key]();
    } else if (Array.isArray(schema[key])) {
      defaults[key] = schema[key].slice();
    } else {
      defaults[key] = schema[key];
    }
  }
  return defaults;
}

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
