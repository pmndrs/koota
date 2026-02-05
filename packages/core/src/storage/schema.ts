import type { Definition, FieldDescriptor, Schema, SchemaKind, StoreType } from './types';
import { $fieldDescriptor } from './types';

// ============================================================================
// Schema Parsing
// ============================================================================

/**
 * Check if a value is a FieldDescriptor (has a valid 'kind' property).
 */
export function isFieldDescriptor(value: unknown): value is FieldDescriptor {
    if (value === null || typeof value !== 'object') return false;
    const obj = value as Record<string, unknown>;
    const kind = obj.kind;
    return (
        kind === 'number' ||
        kind === 'string' ||
        kind === 'boolean' ||
        kind === 'bigint' ||
        kind === 'ref'
    );
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
                defaults[key] =
                    typeof value.default === 'function' ? value.default() : value.default;
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
