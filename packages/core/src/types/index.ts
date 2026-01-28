/**
 * @file types/index.ts
 * @description Type helpers for TypedArray-backed trait storage
 *
 * These helpers allow traits to use TypedArrays as their backing store
 * by detecting typed fields in schemas.
 *
 * @example
 * ```ts
 * import { trait, types } from 'koota'
 *
 * // SoA with TypedArrays (separate arrays per field)
 * const Position = trait({ x: types.f32(0), y: types.f32(0) })
 * ```
 */

// ============================================================================
// Symbols
// ============================================================================

/** Symbol to identify typed field descriptors */
export const $typedArray = Symbol('typedArray');

// ============================================================================
// Types
// ============================================================================

/** Supported TypedArray constructors */
export type TypedArrayConstructor =
    | Float32ArrayConstructor
    | Float64ArrayConstructor
    | Int8ArrayConstructor
    | Int16ArrayConstructor
    | Int32ArrayConstructor
    | Uint8ArrayConstructor
    | Uint8ClampedArrayConstructor
    | Uint16ArrayConstructor
    | Uint32ArrayConstructor
    | BigInt64ArrayConstructor
    | BigUint64ArrayConstructor;

/** A typed field descriptor - what types.f32(0) returns */
export interface TypedField<T extends TypedArrayConstructor = TypedArrayConstructor> {
    [$typedArray]: T;
    default: ElementType<T>;
}

/** Extract the element type from a TypedArray constructor */
export type ElementType<T extends TypedArrayConstructor> = T extends
    | BigInt64ArrayConstructor
    | BigUint64ArrayConstructor
    ? bigint
    : T extends
            | Float32ArrayConstructor
            | Float64ArrayConstructor
            | Int8ArrayConstructor
            | Int16ArrayConstructor
            | Int32ArrayConstructor
            | Uint8ArrayConstructor
            | Uint8ClampedArrayConstructor
            | Uint16ArrayConstructor
            | Uint32ArrayConstructor
      ? number
      : never;

/** Schema where all fields are typed (for buffer storage) */
export type TypedSchema = {
    [key: string]: TypedField;
};

// ============================================================================
// Schema Consistency Types (compile-time enforcement)
// ============================================================================

/** Check if a type is a TypedField */
type IsTypedFieldType<T> = T extends TypedField ? true : false;

/** Check if any field in an object schema is a TypedField */
type HasAnyTypedField<T> = T extends object
    ? true extends { [K in keyof T]: IsTypedFieldType<T[K]> }[keyof T]
        ? true
        : false
    : false;

/** Check if all fields in an object schema are TypedFields */
type AllFieldsTyped<T> = T extends object
    ? false extends { [K in keyof T]: IsTypedFieldType<T[K]> }[keyof T]
        ? false
        : true
    : false;

/**
 * Enforces schema consistency: if any field is a TypedField, all must be.
 * Returns the schema type if valid, or `never` if mixed (causing compile error).
 */
export type ConsistentSchema<T> = T extends (...args: any[]) => any
    ? T // Factory functions (AoS) are always OK
    : keyof T extends never
      ? T // Empty schemas (tags) are OK
      : HasAnyTypedField<T> extends true
        ? AllFieldsTyped<T> extends true
            ? T // All typed - OK (buffer)
            : never // Mixed - reject at compile time
        : T; // No typed fields - OK (SoA)

/**
 * Schema constraint for relations: rejects TypedArray fields entirely.
 * Relations don't support buffer storage because:
 * 1. Non-exclusive relations have nested structure (store[key][eid][targetIndex])
 * 2. The relation API doesn't expose stores for bulk iteration
 */
export type RelationSchema<T> = T extends (...args: any[]) => any
    ? T // Factory functions (AoS) are OK
    : keyof T extends never
      ? T // Empty schemas (tags) are OK
      : HasAnyTypedField<T> extends true
        ? never // Any typed fields - reject at compile time
        : T; // No typed fields - OK (SoA)

/** Convert a typed schema to its record type (what entity.get() returns) */
export type TypedSchemaRecord<T extends TypedSchema> = {
    [K in keyof T]: T[K] extends TypedField<infer C> ? ElementType<C> : never;
};

/** Convert a typed schema to its store type (what getStore() returns for buffer storage) */
export type TypedSchemaStore<T extends TypedSchema> = {
    [K in keyof T]: T[K] extends TypedField<infer C> ? InstanceType<C> : never;
};

// ============================================================================
// Type Helper Factory
// ============================================================================

/**
 * Creates a typed field helper for a specific TypedArray type.
 * @internal
 */
function createTypedHelper<T extends TypedArrayConstructor>(ctor: T, zeroValue: ElementType<T>) {
    return (defaultValue: ElementType<T> = zeroValue): TypedField<T> => ({
        [$typedArray]: ctor,
        default: defaultValue,
    });
}

/**
 * Type helpers for defining TypedArray-backed trait fields.
 *
 * @example
 * ```ts
 * // Floating point
 * types.f32(0)   // Float32Array, default 0
 * types.f64(0)   // Float64Array, default 0
 *
 * // Signed integers
 * types.i8(0)    // Int8Array, default 0
 * types.i16(0)   // Int16Array, default 0
 * types.i32(0)   // Int32Array, default 0
 * types.i64(0n)  // BigInt64Array, default 0n
 *
 * // Unsigned integers
 * types.u8(0)    // Uint8Array, default 0
 * types.u8c(0)   // Uint8ClampedArray, default 0
 * types.u16(0)   // Uint16Array, default 0
 * types.u32(0)   // Uint32Array, default 0
 * types.u64(0n)  // BigUint64Array, default 0n
 * ```
 */
export const types = {
    /** Float32Array field */
    f32: createTypedHelper(Float32Array, 0),
    /** Float64Array field */
    f64: createTypedHelper(Float64Array, 0),
    /** Int8Array field */
    i8: createTypedHelper(Int8Array, 0),
    /** Int16Array field */
    i16: createTypedHelper(Int16Array, 0),
    /** Int32Array field */
    i32: createTypedHelper(Int32Array, 0),
    /** BigInt64Array field (uses bigint) */
    i64: createTypedHelper(BigInt64Array, 0n),
    /** Uint8Array field */
    u8: createTypedHelper(Uint8Array, 0),
    /** Uint8ClampedArray field (clamps values to 0-255) */
    u8c: createTypedHelper(Uint8ClampedArray, 0),
    /** Uint16Array field */
    u16: createTypedHelper(Uint16Array, 0),
    /** Uint32Array field */
    u32: createTypedHelper(Uint32Array, 0),
    /** BigUint64Array field (uses bigint) */
    u64: createTypedHelper(BigUint64Array, 0n),
};

// ============================================================================
// Detection Functions
// ============================================================================

/**
 * Checks if a value is a typed field descriptor (created by types.f32, etc.)
 */
export function isTypedField(value: unknown): value is TypedField {
    return typeof value === 'object' && value !== null && $typedArray in value;
}

/**
 * Checks if a schema object contains only typed fields (for buffer storage detection).
 * Returns false for empty schemas (those are tags).
 */
export function isTypedSchema(schema: object): schema is TypedSchema {
    const values = Object.values(schema);
    return values.length > 0 && values.every(isTypedField);
}

/**
 * Checks if a schema has ANY typed fields (for mixed schema detection).
 */
export function hasAnyTypedFields(schema: object): boolean {
    return Object.values(schema).some(isTypedField);
}

/**
 * Checks if a schema has mixed typed and untyped fields.
 * Returns true if some fields are TypedField and some are not.
 */
export function isMixedSchema(schema: object): boolean {
    const values = Object.values(schema);
    if (values.length === 0) return false;
    const hasTyped = values.some(isTypedField);
    const hasUntyped = values.some((v) => !isTypedField(v));
    return hasTyped && hasUntyped;
}

/**
 * Gets the TypedArray constructor from a typed field descriptor.
 */
export function getTypedArrayConstructor(field: TypedField): TypedArrayConstructor {
    return field[$typedArray];
}

/**
 * Gets the default value from a typed field descriptor.
 */
export function getTypedFieldDefault<T extends TypedArrayConstructor>(
    field: TypedField<T>
): ElementType<T> {
    return field.default;
}

/**
 * Gets the bytes per element for a typed field.
 */
export function getTypedFieldBytesPerElement(field: TypedField): number {
    return field[$typedArray].BYTES_PER_ELEMENT;
}
