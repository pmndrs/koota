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
 * Schema for SoA (Struct of Arrays) traits.
 * Each property is stored in a separate array.
 */
export type SoASchema = {
    readonly kind: 'soa';
    readonly fields: Record<string, FieldDescriptor>;
};

/**
 * Schema for AoS (Array of Structs) traits.
 * Each entity stores a single opaque instance (object, class, array, etc.).
 */
export type AoSSchema = {
    readonly kind: 'aos';
    readonly descriptor: FieldDescriptor<unknown> & { kind: 'ref' };
};

/**
 * Schema for tag traits.
 * No data — serves as a marker/flag.
 */
export type TagSchema = {
    readonly kind: 'tag';
};

/**
 * Canonical schema format — a self-describing discriminated union.
 * The `kind` field determines how to interpret the schema and its storage.
 */
export type Schema = SoASchema | AoSSchema | TagSchema;

/**
 * Valid values in schema shorthand (what users can write).
 */
export type SchemaValue =
    | number
    | string
    | boolean
    | bigint
    | null
    | undefined
    | ((...args: never[]) => unknown)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    | FieldDescriptor<any>;

/**
 * Schema shorthand users can pass to trait().
 * Can contain shorthand values, factory functions, or FieldDescriptor objects.
 */
export type SchemaShorthand = Record<string, SchemaValue> | AoSFactory | Record<string, never>;

/**
 * Generates a valid schema shorthand type for a given data shape T.
 * Each field can be: the value directly, a factory, or a FieldDescriptor.
 */
export type SchemaFor<T> = {
    [K in keyof T]: T[K] | (() => T[K]) | (FieldDescriptor<T[K]> & { default?: T[K] | (() => T[K]) });
};

/**
 * Factory function for AoS (Array of Structs) storage.
 * Returns a single instance that will be stored per entity.
 */
export type AoSFactory<T = unknown> = () => T;

/**
 * Widens primitive literal types to their base types.
 */
export type Widen<T> = T extends number
    ? number
    : T extends string
      ? string
      : T extends boolean
        ? boolean
        : T extends bigint
          ? bigint
          : T;

/**
 * Helper type to extract the actual value type from a default field.
 * Handles both direct values and factory functions, using conditional type distribution.
 */
type ExtractFromDefault<D> = D extends (...args: never[]) => infer R ? R : D;

/**
 * Infers the data type from a single schema shorthand value.
 * Handles: primitives, factories, and FieldDescriptor objects.
 */
export type InferValue<T> =
    // Factory function -> return type
    T extends (...args: never[]) => infer R
        ? R
        : // Branded FieldDescriptor (from field() helper) - use type distribution on default
          T extends { [$fieldDescriptor]?: true; kind: string; default?: infer D }
          ? ExtractFromDefault<Exclude<D, undefined>>
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
 * Infers the data shape from schema shorthand.
 */
export type InferSchema<D> =
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

/**
 * The kind of trait — derived from the Schema discriminant.
 */
export type TraitKind = Schema['kind'];

/**
 * Storage type for trait data.
 * - AoS: Array of instances, one per entity
 * - SoA: Object with arrays, one array per property
 */
export type Store<T> =
    T extends Record<string, never>
        ? Record<string, never>
        : T extends Record<string, unknown>
          ? { [K in keyof T]: T[K][] }
          : T[];

/**
 * Backwards-compatible aliases. Prefer schema-oriented names.
 * @deprecated Use SchemaValue
 */
export type DefinitionValue = SchemaValue;
/**
 * @deprecated Use SchemaShorthand
 */
export type Definition = SchemaShorthand;
/**
 * @deprecated Use SchemaFor
 */
export type DefinitionFor<T> = SchemaFor<T>;
/**
 * @deprecated Use InferSchema
 */
export type InferDefinition<D> = InferSchema<D>;
