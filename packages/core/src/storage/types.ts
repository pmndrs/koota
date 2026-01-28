import { $typedArray, type TypedField, type TypedArrayConstructor } from '../types';

// ============================================================================
// Symbols
// ============================================================================

/**
 * Symbol to identify typed SoA stores that need capacity management
 */
export const $typedStore = Symbol('typedStore');

/**
 * Symbol to identify typed AoS (interleaved) stores
 */
export const $typedAoSStore = Symbol('typedAoSStore');

// ============================================================================
// Store Types
// ============================================================================

/**
 * Storage type for trait data.
 * - AoS: Array of instances, one per entity
 * - SoA: Object with arrays, one array per property
 * - Typed SoA: Object with TypedArrays (specific type based on field)
 * - Typed AoS: Interleaved buffer with strided views
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
 * - 'typed-soa': Struct of Arrays with TypedArrays (separate arrays per field)
 * - 'typed-aos': Array of Structs with interleaved TypedArray buffer
 */
export type StoreType = 'aos' | 'soa' | 'tag' | 'typed-soa' | 'typed-aos';

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
 * Represents a typed field value in a schema (minimal structural type).
 * This is what types.f32(0), types.i32(0), types.i64(0n), etc. return.
 */
export interface TypedFieldValue {
    default: number | bigint;
}

/**
 * Check if a type is a TypedFieldValue
 */
export type IsTypedFieldValue<T> = T extends { default: number | bigint } ? true : false;

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
// Typed Store Interfaces
// ============================================================================

/**
 * Interface for typed SoA stores with capacity management.
 * Each field is stored in a separate TypedArray.
 */
export interface TypedSoAStore {
    [$typedStore]: true;
    _capacity: number;
    _schema: Record<string, TypedField>;
    _bufferType: BufferType;
    [key: string]: unknown;
}

/**
 * Interface for typed AoS (interleaved) stores with capacity management.
 * All fields are stored in a single ArrayBuffer with strided access.
 */
export interface TypedAoSStore {
    [$typedAoSStore]: true;
    _capacity: number;
    _template: Record<string, TypedField>;
    _buffer: ArrayBuffer | SharedArrayBuffer;
    _stride: number;
    _offsets: Record<string, number>;
    _alignment: number;
    _bufferType: BufferType;
    [key: string]: unknown;
}

// ============================================================================
// Typed Trait Options
// ============================================================================

/** Buffer constructor types for typed storage */
export type BufferType = ArrayBufferConstructor | SharedArrayBufferConstructor;

/**
 * Base options for all typed traits (typed-soa and typed-aos).
 * Used when schema is a typed SoA object.
 */
export interface TypedTraitOptions {
    /**
     * Buffer constructor to use for TypedArray backing storage.
     * Use SharedArrayBuffer for multi-threaded scenarios (workers).
     * @default ArrayBuffer
     */
    bufferType?: BufferType;
}

/**
 * Options for typed AoS (interleaved) traits.
 * Used when schema is a factory returning typed fields.
 * Extends base options with alignment for GPU/SIMD scenarios.
 */
export interface TypedAoSTraitOptions extends TypedTraitOptions {
    /**
     * Byte alignment for entity stride in interleaved storage.
     * Useful for SIMD (16-byte) or GPU alignment requirements.
     * @default 4
     */
    alignment?: number;
}

/**
 * Options for creating typed SoA stores.
 * @internal
 */
export interface TypedSoAStoreOptions {
    /** Buffer constructor (default: ArrayBuffer) */
    bufferType?: BufferType;
}

/**
 * Options for creating typed AoS (interleaved) stores.
 * @internal
 */
export interface TypedAoSStoreOptions {
    /** Byte alignment for entity stride (default: 4) */
    alignment?: number;
    /** Buffer constructor (default: ArrayBuffer) */
    bufferType?: BufferType;
}
