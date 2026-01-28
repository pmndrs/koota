import { $typedArray, type TypedField, type TypedArrayConstructor } from '../types';

// ============================================================================
// Symbols
// ============================================================================

/**
 * Symbol to identify buffer stores that need capacity management
 */
export const $bufferStore = Symbol('bufferStore');

// ============================================================================
// Store Types
// ============================================================================

/**
 * Storage type for trait data.
 * - AoS: Array of instances, one per entity
 * - SoA: Object with arrays, one array per property
 * - Typed SoA: Object with TypedArrays (specific type based on field)
 */
export type Store<T extends Schema = any> = T extends AoSFactory
    ? ReturnType<T>[]
    : {
          [P in keyof T]: T[P] extends TypedField<infer C>
              ? InstanceType<C>
              : T[P] extends (...args: never[]) => unknown
                ? ReturnType<T[P]>[]
                : T[P][];
      };

/**
 * Storage layout type.
 * - 'soa': Struct of Arrays - properties stored in separate JS arrays
 * - 'aos': Array of Structs - instances stored directly in JS array
 * - 'tag': No data storage - empty schema marker
 * - 'buffer': Struct of Arrays with TypedArrays (separate arrays per field)
 */
export type StoreType = 'aos' | 'soa' | 'tag' | 'buffer';

/**
 * Schema definition for traits.
 * Can be a SoA object schema, an AoS factory function, or an empty object (tag).
 * TypedField values (from types.f32, etc.) are also allowed for typed storage.
 */
export type Schema =
    | {
          [key: string]:
              | number
              | bigint
              | string
              | boolean
              | null
              | undefined
              | (() => unknown)
              | TypedField;
      }
    | AoSFactory
    | Record<string, never>;

/**
 * Factory function for AoS (Array of Structs) storage.
 * Returns a single instance that will be stored per entity.
 */
export type AoSFactory = () => unknown;

/**
 * Normalizes a single field value to its primitive form.
 * - TypedField<BigInt64ArrayConstructor|BigUint64ArrayConstructor> → bigint
 * - TypedField<other> → number
 * - boolean literal → boolean
 * - function → function (preserved)
 * - object (non-function) → never (not allowed in schemas)
 */
type NormField<T> =
    T extends TypedField<infer C>
        ? C extends BigInt64ArrayConstructor | BigUint64ArrayConstructor
            ? bigint
            : number
        : T extends (...args: never[]) => unknown
          ? T
          : T extends object
            ? never
            : T extends boolean
              ? boolean
              : T;

/**
 * Normalizes an object's fields (used for both SoA schemas and AoS return types).
 */
type NormObject<T> = {
    [K in keyof T]: NormField<T[K]>;
};

/**
 * Normalizes schema types to their primitive forms.
 * Ensures that explicit values like true, false or "string literal" are
 * normalized to their primitive types (boolean, string, etc).
 * TypedField is normalized to number (the type returned by entity.get()).
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
                    : ReturnType<T> extends object
                      ? NormObject<ReturnType<T>>
                      : ReturnType<T>
          : NormObject<T>;

// ============================================================================
// Buffer Store Interfaces
// ============================================================================

/**
 * Interface for buffer stores with capacity management.
 * Each field is stored in a separate TypedArray.
 */
export interface BufferStore {
    [$bufferStore]: true;
    _capacity: number;
    _schema: Record<string, TypedField>;
    _bufferType: BufferType;
    [key: string]: unknown;
}

// ============================================================================
// Buffer Trait Options
// ============================================================================

/** Buffer constructor types for typed storage */
export type BufferType = ArrayBufferConstructor | SharedArrayBufferConstructor;

/**
 * Options for buffer traits.
 * Used when schema is a typed SoA object.
 */
export interface BufferTraitOptions {
    /**
     * Buffer constructor to use for TypedArray backing storage.
     * Use SharedArrayBuffer for multi-threaded scenarios (workers).
     * @default ArrayBuffer
     */
    bufferType?: BufferType;
}

/**
 * Options for creating buffer stores.
 * @internal
 */
export interface BufferStoreOptions {
    /** Buffer constructor (default: ArrayBuffer) */
    bufferType?: BufferType;
}

