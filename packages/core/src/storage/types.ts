// ============================================================================
// Schema Types (canonical metadata format)
// ============================================================================

/** Symbol to brand field descriptors for type checking */
export const $fieldDescriptor = Symbol('fieldDescriptor');

/**
 * The kind of a schema field, determined by runtime type detection.
 */
export type SchemaKind = 'number' | 'string' | 'boolean' | 'bigint' | 'ref';

/**
 * Describes a single field in a trait's schema.
 * Contains metadata about the field (kind, default, required, hooks, etc.)
 * A Schema is made up of FieldDescriptors.
 */
export type FieldDescriptor<T = unknown> = {
    [$fieldDescriptor]?: true;
    /** The runtime kind of this field */
    kind: SchemaKind;
    /** Default value or factory function that produces the default */
    default?: T | (() => T);
    /** Whether this field must be provided when adding the trait */
    required?: boolean;
    /** Hook called when setting this field's value */
    onSet?: (value: T) => T;
    /** Extensible - users can add custom properties for their own integrations */
    [key: string]: unknown;
};

/**
 * Canonical schema format - a collection of field descriptors.
 */
export type Schema = Record<string, FieldDescriptor>;

// ============================================================================
// Definition Types (input format)
// ============================================================================

/**
 * Valid values in a definition (what users can write).
 */
export type DefinitionValue =
    | number
    | string
    | boolean
    | bigint
    | null
    | undefined
    | ((...args: never[]) => unknown)
    | FieldDescriptor;

/**
 * A trait definition - what users pass to trait().
 * Can contain shorthand values, factory functions, or FieldDescriptor objects.
 */
export type Definition = Record<string, DefinitionValue> | AoSFactory | Record<string, never>;

/**
 * Generates a valid definition type for a given data shape T.
 * Each field can be: the value directly, a factory, or a FieldDescriptor.
 */
export type DefinitionFor<T> = {
    [K in keyof T]:
        | T[K]
        | (() => T[K])
        | (FieldDescriptor<T[K]> & { default?: T[K] | (() => T[K]) });
};

/**
 * Factory function for AoS (Array of Structs) storage.
 * Returns a single instance that will be stored per entity.
 */
export type AoSFactory<T = unknown> = () => T;

// ============================================================================
// Type Inference (Definition -> Data Type)
// ============================================================================

/**
 * Infers the data type from a single definition value.
 * Handles: primitives, factories, and FieldDescriptor objects.
 */
export type InferValue<T> =
    // Factory function -> return type
    T extends (...args: never[]) => infer R
        ? R
        : // FieldDescriptor with required but no default -> unknown (must be provided)
          T extends { kind: string; required: true; default?: undefined }
          ? unknown
          : // FieldDescriptor with factory default
            T extends { kind: string; default: (...args: never[]) => infer R }
            ? R
            : // FieldDescriptor with value default
              T extends { kind: string; default: infer D }
              ? D
              : // FieldDescriptor without default
                T extends { kind: string }
                ? unknown
                : // Primitive value - widen literals to primitives
                  T extends number
                  ? number
                  : T extends string
                    ? string
                    : T extends boolean
                      ? boolean
                      : T extends bigint
                        ? bigint
                        : T;

/**
 * Infers the data shape from a definition.
 */
export type InferDefinition<D> =
    // AoS factory -> return type
    D extends (...args: never[]) => infer T
        ? T
        : // Empty object (tag)
          D extends Record<string, never>
          ? Record<string, never>
          : // Object definition
            D extends object
            ? { [K in keyof D]: InferValue<D[K]> }
            : never;

// ============================================================================
// Storage Types
// ============================================================================

/**
 * Storage layout type.
 * - 'soa': Struct of Arrays - properties stored in separate arrays
 * - 'aos': Array of Structs - instances stored directly
 * - 'tag': No data storage - empty schema marker
 */
export type StoreType = 'aos' | 'soa' | 'tag';

/**
 * Storage type for trait data.
 * - AoS: Array of instances, one per entity
 * - SoA: Object with arrays, one array per property
 */
export type Store<T> = T extends Record<string, never>
    ? Record<string, never>
    : T extends Record<string, unknown>
      ? { [K in keyof T]: T[K][] }
      : T[];

// ============================================================================
// Legacy Aliases (for backward compatibility during migration)
// ============================================================================

/** @deprecated Use FieldDescriptor instead */
export type FieldSchema<T = unknown> = FieldDescriptor<T>;

/** @deprecated Use FieldDescriptor instead */
export type SchemaEntry<T = unknown> = FieldDescriptor<T>;

/** @deprecated Use $fieldDescriptor instead */
export const $schemaEntry = $fieldDescriptor;

/** @deprecated Use Schema instead */
export type ParsedSchema = Schema;

/**
 * @deprecated - Norm is no longer needed with the new type inference
 */
export type Norm<T> = T extends Record<string, never>
    ? T
    : T extends AoSFactory<infer R>
      ? AoSFactory<R>
      : T extends Record<string, DefinitionValue>
        ? InferDefinition<T>
        : T;
