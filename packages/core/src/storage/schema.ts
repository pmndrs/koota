import type { Definition, FieldDescriptor, Schema, SchemaKind, StoreType, Widen } from './types';
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
// Overload 1: Factory default - infer T from return type
export function field<T>(descriptor: {
    kind: SchemaKind;
    default: () => T;
    required?: boolean;
    onSet?: (value: T) => T;
    [key: string]: unknown;
}): FieldDescriptor<T>;
// Overload 2: Primitive default - widen to base type
export function field<T extends number | string | boolean | bigint>(descriptor: {
    kind: SchemaKind;
    default: T;
    required?: boolean;
    onSet?: (value: Widen<T>) => Widen<T>;
    [key: string]: unknown;
}): FieldDescriptor<Widen<T>>;
// Overload 3: Required without default
export function field<T = unknown>(descriptor: {
    kind: SchemaKind;
    required: true;
    default?: undefined;
    onSet?: (value: T) => T;
    [key: string]: unknown;
}): FieldDescriptor<T>;
// Implementation
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

// ============================================================================
// Schema Parsing
// ============================================================================

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
 * Parse a trait definition into canonical Schema format.
 * Each field is normalized into a FieldDescriptor with kind and default.
 *
 * @example
 * // Shorthand input
 * parseDefinition({ x: 0, y: 0 })
 * // Returns: { x: { kind: 'number', default: 0 }, y: { kind: 'number', default: 0 } }
 *
 * @example
 * // Mixed input (shorthand + field descriptor)
 * parseDefinition({ x: 0, color: { kind: 'ref', default: () => ({ r: 0 }) } })
 * // Returns: { x: { kind: 'number', default: 0 }, color: { kind: 'ref', default: [fn] } }
 */
export function parseDefinition(definition: Definition): Schema {
    // AoS factory - not a field-based schema
    if (typeof definition === 'function') {
        return {};
    }

    // Empty definition (tag)
    if (!definition || Object.keys(definition).length === 0) {
        return {};
    }

    const parsed: Schema = {};

    for (const key in definition) {
        const value = definition[key as keyof typeof definition];
        parsed[key] = parseField(value);
    }

    return parsed;
}

// ============================================================================
// Schema Defaults
// ============================================================================

/**
 * Get default values from a schema.
 * Returns null for tags (empty schemas) or if no defaults exist.
 * Handles both legacy definition format and canonical FieldDescriptor format.
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
        const value = schema[key];

        // Handle canonical FieldDescriptor format
        if (isFieldDescriptor(value)) {
            if (value.default !== undefined) {
                defaults[key] = typeof value.default === 'function' ? value.default() : value.default;
            }
            continue;
        }

        // Handle legacy shorthand format
        if (typeof value === 'function') {
            defaults[key] = value();
        } else {
            defaults[key] = value;
        }
    }
    return defaults;
}

// ============================================================================
// Definition Validation
// ============================================================================

/**
 * Validate a trait definition.
 * Objects are only allowed if they are valid FieldDescriptor objects.
 */
export /* @inline @pure */ function validateDefinition(definition: Definition) {
    if (typeof definition === 'function') return; // AoS factory
    for (const key in definition) {
        const value = (definition as Record<string, unknown>)[key];
        if (value !== null && typeof value === 'object') {
            // Allow FieldDescriptor objects
            if (isFieldDescriptor(value)) continue;

            const kind = Array.isArray(value) ? 'array' : 'object';
            throw new Error(`Koota: ${key} is an ${kind}, which is not supported in traits.`);
        }
    }
}
