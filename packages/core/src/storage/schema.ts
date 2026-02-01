import type {
    ExpandedSchema,
    FieldDescriptor,
    FieldType,
    Schema,
    StoreType,
    TraitDescriptor,
} from './types';

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
        } else {
            defaults[key] = schema[key];
        }
    }
    return defaults;
}

/**
 * Validates a schema and throws an error if it contains invalid values.
 * Objects and arrays must be wrapped in factory functions.
 */
export /* @inline @pure */ function validateSchema(schema: Schema) {
    for (const key in schema) {
        const value = schema[key as keyof Schema];
        if (value !== null && typeof value === 'object') {
            const kind = Array.isArray(value) ? 'array' : 'object';
            throw new Error(
                `Koota: "${key}" is an ${kind}, which is not allowed. ` +
                    `Use a factory function instead: ${key}: () => ${kind === 'array' ? '[]' : '{}'}`
            );
        }
    }
}

// ============================================================================
// Schema Normalization
// ============================================================================

/**
 * Infers the field type from a value.
 */
export function inferFieldType(value: unknown): FieldType {
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';
    if (Array.isArray(value)) return 'array';
    const t = typeof value;
    if (t === 'object') return 'object';
    return t as FieldType; // number, string, boolean, bigint
}

/**
 * Normalizes a single field value into a FieldDescriptor.
 * If the value is a factory function, it calls it to determine the type.
 */
export function normalizeField(value: unknown): FieldDescriptor {
    if (typeof value === 'function') {
        const sample = value();
        return { type: inferFieldType(sample), default: value };
    }
    return { type: inferFieldType(value), default: value };
}

/**
 * Normalizes a shorthand schema into an expanded TraitDescriptor.
 * This makes all implicit behaviors explicit.
 *
 * @example
 * // Tag
 * normalizeSchema({}) // { storage: 'tag', schema: {} }
 *
 * // SoA
 * normalizeSchema({ x: 0, y: 0 })
 * // { storage: 'soa', schema: { x: { type: 'number', default: 0 }, y: { type: 'number', default: 0 } } }
 *
 * // AoS
 * normalizeSchema(() => ({ x: 0 }))
 * // { storage: 'aos', schema: { $value: { type: 'object', default: factory } } }
 */
export function normalizeSchema(schema: Schema): TraitDescriptor {
    // Tag: empty schema
    if (!schema || (typeof schema !== 'function' && Object.keys(schema).length === 0)) {
        return { storage: 'tag', schema: {} };
    }

    // AoS: factory function for whole object
    if (typeof schema === 'function') {
        return {
            storage: 'aos',
            schema: { $value: { type: 'object', default: schema } },
        };
    }

    // SoA: object with field definitions
    const expanded: ExpandedSchema = {};
    for (const [key, value] of Object.entries(schema)) {
        expanded[key] = normalizeField(value);
    }
    return { storage: 'soa', schema: expanded };
}
