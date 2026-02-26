import type {
    AoSSchema,
    FieldDescriptor,
    Schema,
    SchemaShorthand,
    SchemaKind,
    SoASchema,
    TagSchema,
    Widen,
} from './types';
import { $fieldDescriptor } from './types';

/**
 * Creates an explicit FieldDescriptor with proper type inference.
 * Use this when you want to define field metadata directly instead of using shorthand.
 *
 * @example
 * // Explicit field descriptor with extensions
 * const Health = trait({
 *   current: field({ kind: 'number', default: 100, onSet: clamp }),
 *   max: field({ kind: 'number', default: 100 }),
 * })
 *
 * @example
 * // Single-ref trait with field descriptor
 * const Position = trait(field({ kind: 'ref', default: () => ({ x: 0, y: 0 }) }))
 */

// Overload 1: Infer data type from SoA factory constructor
export function field<T, K extends SchemaKind>(descriptor: {
    kind: K;
    default: () => T;
    required?: boolean;
    onSet?: (value: T) => T;
    [key: string]: unknown;
}): FieldDescriptor<T> & { kind: K };
// Overload 2: Infer data type from AoS default
export function field<
    T extends number | string | boolean | bigint,
    K extends SchemaKind,
>(descriptor: {
    kind: K;
    default: T;
    required?: boolean;
    onSet?: (value: Widen<T>) => Widen<T>;
    [key: string]: unknown;
}): FieldDescriptor<Widen<T>> & { kind: K };
// Overload 3: Required with no default
export function field<T = unknown, K extends SchemaKind = SchemaKind>(descriptor: {
    kind: K;
    required: true;
    default?: undefined;
    onSet?: (value: T) => T;
    [key: string]: unknown;
}): FieldDescriptor<T> & { kind: K };

export function field(descriptor: {
    kind: SchemaKind;
    default?: unknown;
    required?: boolean;
    onSet?: (value: unknown) => unknown;
    [key: string]: unknown;
}): FieldDescriptor<unknown> {
    return {
        ...descriptor,
        [$fieldDescriptor]: true,
    } as FieldDescriptor<unknown>;
}

/**
 * Check if a value is a FieldDescriptor (created via field() helper).
 * Only objects with the $fieldDescriptor symbol are considered FieldDescriptors.
 */
export function isFieldDescriptor(value: unknown): value is FieldDescriptor {
    if (value === null || typeof value !== 'object') return false;
    return $fieldDescriptor in value;
}

/**
 * Detect the SchemaKind from a definition value.
 * - Primitives map directly: number, string, boolean, bigint
 * - Functions (factories) are 'ref' since they produce reference types
 * - null/undefined default to 'ref'
 */
export function detectKind(value: unknown): SchemaKind {
    const type = typeof value;
    if (type === 'number') return 'number';
    if (type === 'string') return 'string';
    if (type === 'boolean') return 'boolean';
    if (type === 'bigint') return 'bigint';
    // Functions are factories that return ref types
    // null/undefined are treated as ref (will need explicit value)
    return 'ref';
}

/**
 * Parse a single field definition into canonical FieldDescriptor format.
 * Handles both shorthand values and already-expanded FieldDescriptor objects.
 */
export function parseField(value: unknown): FieldDescriptor {
    // Already in FieldDescriptor format - pass through
    if (isFieldDescriptor(value)) {
        return value;
    }

    // Shorthand format - detect kind and wrap
    const kind = detectKind(value);

    if (typeof value === 'function') {
        // Factory function for ref types
        return { [$fieldDescriptor]: true, kind: 'ref', default: value };
    }

    // Primitive value
    return { [$fieldDescriptor]: true, kind, default: value as FieldDescriptor['default'] };
}

/**
 * Normalize a trait schema into canonical Schema format.
 * Returns a self-describing discriminated union — the `kind` field
 * determines the storage strategy and how to interpret the schema.
 *
 * @example
 * normalizeSchema({ x: 0, y: 0 })
 * // { kind: 'soa', fields: { x: { kind: 'number', default: 0 }, y: { ... } } }
 *
 * @example
 * normalizeSchema(() => new Vector3())
 * // { kind: 'aos', descriptor: { kind: 'ref', default: [factory] } }
 */
export function normalizeSchema(schema: SchemaShorthand | FieldDescriptor): Schema {
    // Top-level FieldDescriptor (single-ref AoS trait via field())
    if (isFieldDescriptor(schema)) {
        const def = schema.default;
        const factory = typeof def === 'function' ? def : () => def;
        return {
            kind: 'aos',
            descriptor: { [$fieldDescriptor]: true, kind: 'ref', default: factory },
        } as AoSSchema;
    }

    // AoS factory
    if (typeof schema === 'function') {
        return {
            kind: 'aos',
            descriptor: { [$fieldDescriptor]: true, kind: 'ref', default: schema },
        } as AoSSchema;
    }

    // Empty schema (tag)
    if (!schema || Object.keys(schema).length === 0) {
        return { kind: 'tag' } as TagSchema;
    }

    // SoA — parse each field into a FieldDescriptor
    const fields: Record<string, FieldDescriptor> = {};

    for (const key in schema) {
        const value = schema[key as keyof typeof schema];
        fields[key] = parseField(value);
    }

    return { kind: 'soa', fields } as SoASchema;
}

/**
 * Validate a trait schema (including shorthand forms).
 * Objects are only allowed if they are valid FieldDescriptor objects.
 */
export /* @inline @pure */ function validateSchema(schema: SchemaShorthand | FieldDescriptor) {
    if (typeof schema === 'function') return; // AoS factory
    if (isFieldDescriptor(schema)) return; // Top-level FieldDescriptor
    for (const key in schema) {
        const value = (schema as Record<string, unknown>)[key];
        if (value !== null && typeof value === 'object') {
            // Allow FieldDescriptor objects
            if (isFieldDescriptor(value)) continue;

            const kind = Array.isArray(value) ? 'array' : 'object';
            throw new Error(`Koota: ${key} is an ${kind}, which is not supported in traits.`);
        }
    }
}
