/**
 * Storage type for trait data.
 * - AoS: Array of instances, one per entity
 * - SoA: Object with arrays, one array per property
 */
export type Store<T extends Schema = any> = T extends AoSFactory
    ? ReturnType<T>[]
    : {
          [P in keyof T]: T[P] extends (...args: never[]) => unknown ? ReturnType<T[P]>[] : T[P][];
      };

/**
 * Storage layout type.
 * - 'soa': Struct of Arrays - properties stored in separate arrays
 * - 'aos': Array of Structs - instances stored directly
 * - 'tag': No data storage - empty schema marker
 */
export type StoreType = 'aos' | 'soa' | 'tag';

/**
 * Schema definition for traits.
 * Can be a SoA object schema, an AoS factory function, or an empty object (tag).
 */
export type Schema =
    | {
          [key: string]: number | bigint | string | boolean | null | undefined | (() => unknown);
      }
    | AoSFactory
    | Record<string, never>;

/**
 * Factory function for AoS (Array of Structs) storage.
 * Returns a single instance that will be stored per entity.
 */
export type AoSFactory = () => unknown;

/**
 * Normalizes schema types to their primitive forms.
 * Ensures that explicit values like true, false or "string literal" are
 * normalized to their primitive types (boolean, string, etc).
 */
export type Norm<T extends Schema> =
    T extends Record<string, never>
        ? T
        : T extends AoSFactory
          ? () => ReturnType<T> extends number
                ? number
                : ReturnType<T> extends boolean
                  ? boolean
                  : ReturnType<T> extends string
                    ? string
                    : ReturnType<T>
          : {
                  [K in keyof T]: T[K] extends object
                      ? T[K] extends (...args: never[]) => unknown
                          ? T[K]
                          : never
                      : T[K] extends boolean
                        ? boolean
                        : T[K];
              }[keyof T] extends never
            ? never
            : {
                  [K in keyof T]: T[K] extends boolean ? boolean : T[K];
              };

// ============================================================================
// Expanded Schema Types
// ============================================================================

/**
 * Scalar field types that can be stored directly in SoA arrays.
 */
export type ScalarFieldType = 'number' | 'string' | 'boolean' | 'bigint' | 'null' | 'undefined';

/**
 * Reference field types that require per-entity instances.
 */
export type ReferenceFieldType = 'object' | 'array';

/**
 * All possible field types in an expanded schema.
 */
export type FieldType = ScalarFieldType | ReferenceFieldType;

/**
 * Expanded field descriptor with explicit type and default value.
 * This is the normalized representation of a single schema field.
 */
export interface FieldDescriptor<T = unknown> {
    /** The runtime type of the field */
    type: FieldType;
    /** The default value or factory function to create the default */
    default: T | (() => T);
}

/**
 * Expanded schema with explicit field descriptors for each property.
 * This is the normalized internal representation of a trait schema.
 */
export type ExpandedSchema = Record<string, FieldDescriptor>;

/**
 * Complete trait descriptor containing storage type and expanded schema.
 * This is the fully normalized representation of a trait definition.
 */
export interface TraitDescriptor<S extends ExpandedSchema = ExpandedSchema> {
    /** The storage layout type */
    storage: StoreType;
    /** The expanded schema with field descriptors */
    schema: S;
}
