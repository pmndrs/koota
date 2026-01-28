/**
 * @file layout/types.ts
 * @description Core type definitions for interleaved layouts
 *
 * Type naming conventions (following koota patterns):
 * - *Schema: Input definition types (what user provides)
 * - *Record: Output data types (what entity.get() returns)
 * - *Store: Storage types (TypedArray instances for direct access)
 * - *Options: Configuration options for factory functions
 * - *Metadata: Internal computed metadata
 */

// ============================================================================
// TypedArray Types
// ============================================================================

/** Supported TypedArray constructors for layout fields */
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

/** TypedArray instance types */
export type TypedArrayInstance =
    | Float32Array
    | Float64Array
    | Int8Array
    | Int16Array
    | Int32Array
    | Uint8Array
    | Uint8ClampedArray
    | Uint16Array
    | Uint32Array
    | BigInt64Array
    | BigUint64Array;

/** Extract element type from a TypedArray constructor */
export type ElementType<T extends TypedArrayConstructor> = T extends BigInt64ArrayConstructor
    ? bigint
    : T extends BigUint64ArrayConstructor
      ? bigint
      : T extends Float32ArrayConstructor
        ? number
        : T extends Float64ArrayConstructor
          ? number
          : T extends Int8ArrayConstructor
            ? number
            : T extends Int16ArrayConstructor
              ? number
              : T extends Int32ArrayConstructor
                ? number
                : T extends Uint8ArrayConstructor
                  ? number
                  : T extends Uint8ClampedArrayConstructor
                    ? number
                    : T extends Uint16ArrayConstructor
                      ? number
                      : T extends Uint32ArrayConstructor
                        ? number
                        : never;

// ============================================================================
// Schema Types
// ============================================================================

/** A field group is an object mapping field names to TypedArray constructors */
export type FieldGroup = {
    readonly [key: string]: TypedArrayConstructor;
};

/** A single field is just a TypedArray constructor */
export type SingleField = TypedArrayConstructor;

/** Schema entry can be either a single field or a field group */
export type SchemaEntry = SingleField | FieldGroup;

/** Layout schema maps trait names to schema entries */
export type LayoutSchema = {
    readonly [key: string]: SchemaEntry;
};

/** Check if a schema entry is a field group (object) vs single field (constructor) */
export type IsFieldGroup<T extends SchemaEntry> = T extends TypedArrayConstructor ? false : true;

// ============================================================================
// Record Types (what entity.get() returns)
// ============================================================================

/** Convert a field group schema to a record type (mutable for assignment) */
export type FieldGroupRecord<T extends FieldGroup> = {
    -readonly [K in keyof T]: ElementType<T[K]>;
};

/** Convert a schema entry to its record type */
export type SchemaEntryRecord<T extends SchemaEntry> = T extends TypedArrayConstructor
    ? ElementType<T>
    : T extends FieldGroup
      ? FieldGroupRecord<T>
      : never;

/** Convert a layout schema to record types for each trait */
export type LayoutRecords<S extends LayoutSchema> = {
    [K in keyof S]: SchemaEntryRecord<S[K]>;
};

// ============================================================================
// Store Types (direct array access)
// ============================================================================

/**
 * Store type for a field group - each field is a TypedArray
 * The arrays are VIEWS into the interleaved buffer, not separate allocations
 */
export type FieldGroupStore<T extends FieldGroup> = {
    -readonly [K in keyof T]: InstanceType<T[K]>;
};

/** Store type for a single field */
export type SingleFieldStore<T extends TypedArrayConstructor> = InstanceType<T>;

/** Store type for a schema entry */
export type SchemaEntryStore<T extends SchemaEntry> = T extends TypedArrayConstructor
    ? SingleFieldStore<T>
    : T extends FieldGroup
      ? FieldGroupStore<T>
      : never;

/**
 * Full store type for a layout
 * Provides direct TypedArray access to each field
 */
export type LayoutStore<S extends LayoutSchema> = {
    [K in keyof S]: SchemaEntryStore<S[K]>;
};

// ============================================================================
// Growth Policies
// ============================================================================

/** Buffer growth strategy */
export type GrowthPolicy =
    | 'fixed' // Throw if capacity exceeded
    | 'double' // Reallocate to 2x capacity
    | 'ring' // Overwrite oldest (circular buffer)
    | 'none'; // For BYOB - externally managed

// ============================================================================
// Layout Options
// ============================================================================

export interface LayoutOptions {
    /** Initial/fixed capacity in entities */
    capacity: number;

    /** Growth policy when capacity is exceeded */
    growth?: GrowthPolicy;

    /**
     * External buffer to use (BYOB mode)
     * When provided, koota writes directly to this buffer
     */
    buffer?: ArrayBuffer | ArrayBufferLike;

    /**
     * Byte alignment for each entity's data
     * Useful for SIMD or GPU alignment requirements
     * @default 4
     */
    alignment?: number;
}

// ============================================================================
// Layout Metadata
// ============================================================================

/** Offset information for a field within the interleaved buffer */
export interface FieldOffset {
    /** Byte offset from start of entity's data */
    byteOffset: number;
    /** Size in bytes */
    byteSize: number;
    /** TypedArray constructor for this field */
    type: TypedArrayConstructor;
}

/** Metadata for a trait within the layout */
export interface TraitLayoutInfo {
    /** Byte offset of this trait within entity stride */
    byteOffset: number;
    /** Total byte size of this trait */
    byteSize: number;
    /** Field offsets (relative to trait start) for field groups, empty for single fields */
    fields: Map<string, FieldOffset>;
}

/** Complete layout metadata */
export interface LayoutMetadata<S extends LayoutSchema> {
    /** Schema that defined this layout */
    schema: S;
    /** Total bytes per entity */
    stride: number;
    /** Byte offsets for each trait */
    traitOffsets: { [K in keyof S]: number };
    /** Detailed layout info for each trait */
    traitInfo: { [K in keyof S]: TraitLayoutInfo };
    /** Ordered list of all fields for iteration */
    flatFields: Array<{
        traitName: keyof S;
        fieldName: string | null; // null for single fields
        byteOffset: number;
        byteSize: number;
        type: TypedArrayConstructor;
    }>;
}

// ============================================================================
// Entity Mapping (Dense Packing)
// ============================================================================

/** Maps entity IDs to buffer indices and vice versa */
export interface EntityMapping {
    /** Entity ID → buffer index */
    entityToIndex: Map<number, number>;
    /** Buffer index → entity ID */
    indexToEntity: number[];
    /** Current count of active entities */
    count: number;
}

// ============================================================================
// Layout Instance
// ============================================================================

/** Symbol to identify layout instances */
export const LAYOUT_SYMBOL = Symbol('Layout');

/**
 * A layout instance provides:
 * - Extracted traits for ECS usage
 * - Direct buffer access for GPU upload
 * - Entity mapping for dense packing
 */
export interface Layout<S extends LayoutSchema> {
    [LAYOUT_SYMBOL]: true;

    /** The schema that defined this layout */
    readonly schema: S;

    /** Extracted traits for ECS usage */
    readonly traits: LayoutTraits<S>;

    /** The underlying ArrayBuffer */
    readonly buffer: ArrayBuffer;

    /** Direct store access (TypedArray views into buffer) */
    readonly store: LayoutStore<S>;

    /** Layout metadata */
    readonly metadata: LayoutMetadata<S>;

    /** Total bytes per entity */
    readonly stride: number;

    /** Current entity count */
    readonly count: number;

    /** Maximum capacity */
    readonly capacity: number;

    /** Growth policy */
    readonly growth: GrowthPolicy;

    // Entity mapping operations

    /** Get buffer index for an entity ID, or -1 if not in layout */
    indexOf(entityId: number): number;

    /** Get entity ID at a buffer index */
    entityAt(bufferIndex: number): number;

    /** Check if entity is in this layout */
    has(entityId: number): boolean;

    // Mutation operations (internal use)

    /** Add an entity to the layout, returns buffer index */
    _addEntity(entityId: number): number;

    /** Remove an entity from the layout */
    _removeEntity(entityId: number): void;

    /** Set values for an entity */
    _setValues<K extends keyof S>(
        entityId: number,
        traitName: K,
        values: SchemaEntryRecord<S[K]>
    ): void;

    /** Get values for an entity */
    _getValues<K extends keyof S>(entityId: number, traitName: K): SchemaEntryRecord<S[K]>;
}

// ============================================================================
// Trait Types for Layout
// ============================================================================

/**
 * TYPE CHALLENGE: Layout traits need to be compatible with koota's Trait type
 * for use with world.spawn(), entity.add(), and queries.
 *
 * Current status: Layout traits have the callable signature and basic properties,
 * but are MISSING the $internal property required for world integration.
 *
 * To integrate with koota, layout traits need:
 * - $internal.id
 * - $internal.get(index, store) -> record
 * - $internal.set(index, store, value)
 * - $internal.fastSet / fastSetWithChangeDetection
 * - $internal.createStore() -> store
 * - $internal.relation = null
 * - $internal.type = 'interleaved'
 */

/** Marker interface for traits backed by a layout */
export interface LayoutBackedTrait<S extends SchemaEntry> {
    /** Reference to the parent layout */
    readonly _layout: Layout<any>;
    /** Name of this trait within the layout */
    readonly _traitName: string;
    /** The schema entry for this trait */
    readonly _schema: S;
}

/**
 * Extract trait types from a layout schema
 * Each entry becomes a trait with the appropriate record type
 */
export type LayoutTraits<S extends LayoutSchema> = {
    [K in keyof S]: LayoutTrait<S[K]>;
};

/**
 * A trait extracted from a layout
 * Should be compatible with koota's Trait type for queries
 *
 * TYPE CHALLENGE: This needs to match koota's Trait signature:
 * - Callable: (params?) => [Trait, params]
 * - Has schema, id properties
 * - Has $internal with get/set functions
 */
export type LayoutTrait<S extends SchemaEntry> = {
    /** Callable to create trait tuple for spawn/add */
    (params?: Partial<SchemaEntryRecord<S>>): [LayoutTrait<S>, Partial<SchemaEntryRecord<S>>];

    /** Unique trait ID */
    readonly id: number;

    /** The schema for this trait */
    readonly schema: S;

    /** Reference to parent layout */
    readonly _layout: Layout<any>;

    /** Name within the layout */
    readonly _traitName: string;
};

// ============================================================================
// Single-Trait Interleaved Types
// ============================================================================

/** Options for single-trait interleaved */
export interface InterleavedTraitOptions {
    /** Initial capacity */
    capacity?: number;
    /** Maximum capacity */
    maxCapacity?: number;
    /** Growth factor */
    growthFactor?: number;
    /** Default values */
    defaults?: Record<string, number>;
}

/** Symbol for interleaved traits */
export const INTERLEAVED_TRAIT_SYMBOL = Symbol('InterleavedTrait');

/**
 * A single-trait interleaved storage
 * Similar to typedTrait but with interleaved memory layout
 */
export interface InterleavedTrait<S extends FieldGroup> {
    [INTERLEAVED_TRAIT_SYMBOL]: true;

    /** Callable for spawn/add */
    (params?: Partial<FieldGroupRecord<S>>): [InterleavedTrait<S>, Partial<FieldGroupRecord<S>>];

    /** Unique ID */
    readonly id: number;

    /** Schema */
    readonly schema: S;

    /** The interleaved buffer */
    readonly buffer: ArrayBuffer;

    /** Stride in bytes */
    readonly stride: number;

    /** Field offsets */
    readonly offsets: { [K in keyof S]: number };

    /** Current capacity */
    readonly capacity: number;

    /** Direct store access (TypedArray views) */
    readonly store: FieldGroupStore<S>;

    /** Default values */
    readonly defaults: Partial<FieldGroupRecord<S>>;
}

// ============================================================================
// Utility Types
// ============================================================================

/** Get bytes per element for a TypedArray constructor */
export function getBytesPerElement(ctor: TypedArrayConstructor): number {
    return ctor.BYTES_PER_ELEMENT;
}

/** Check if a value is a TypedArray constructor */
export function isTypedArrayConstructor(value: unknown): value is TypedArrayConstructor {
    return (
        value === Float32Array ||
        value === Float64Array ||
        value === Int8Array ||
        value === Int16Array ||
        value === Int32Array ||
        value === Uint8Array ||
        value === Uint16Array ||
        value === Uint32Array
    );
}

/** Check if a schema entry is a field group */
export function isFieldGroup(entry: SchemaEntry): entry is FieldGroup {
    return typeof entry === 'object' && !isTypedArrayConstructor(entry);
}
