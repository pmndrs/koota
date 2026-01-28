import { isTypedField } from '../types';
import type { BufferStoreOptions, Schema, StoreType } from './types';

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
        } else if (isTypedField(schema[key])) {
            // For buffer storage, extract default from TypedField
            defaults[key] = schema[key].default;
        } else {
            defaults[key] = schema[key];
        }
    }
    return defaults;
}

export /* @inline @pure */ function validateSchema(schema: Schema) {
    for (const key in schema) {
        const value = schema[key as keyof Schema];
        if (value !== null && typeof value === 'object') {
            // Allow TypedField objects (from types.f32, types.i32, etc.)
            if (isTypedField(value)) continue;

            const kind = Array.isArray(value) ? 'array' : 'object';
            throw new Error(`Koota: ${key} is an ${kind}, which is not supported in traits.`);
        }
    }
}

/**
 * Validate buffer trait options.
 * Throws if bufferType was explicitly provided but is not a valid constructor
 * (e.g., SharedArrayBuffer is undefined in this environment).
 */
export function validateBufferOptions(options: BufferStoreOptions): void {
    if ('bufferType' in options && typeof options.bufferType !== 'function') {
        throw new Error(
            'Koota: Invalid bufferType option. SharedArrayBuffer may not be available in this environment. ' +
                'Check availability with: typeof SharedArrayBuffer !== "undefined"'
        );
    }
}
