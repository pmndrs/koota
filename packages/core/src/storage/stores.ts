import { $typedArray, isTypedSchema, type TypedField, type TypedArrayConstructor } from '../types';
import {
    $typedStore,
    $typedAoSStore,
    type Schema,
    type Store,
    type TypedSoAStore,
    type TypedAoSStore,
    type TypedSoAStoreOptions,
    type TypedAoSStoreOptions,
    type BufferType,
} from './types';

/** Initial capacity for typed stores */
const INITIAL_CAPACITY = 8;

/** Growth factor when typed stores need to expand */
const GROWTH_FACTOR = 2;

/** Default alignment for interleaved stores */
const DEFAULT_ALIGNMENT = 4;

/** All TypedArray instance types */
type AnyTypedArray =
    | Int8Array
    | Uint8Array
    | Uint8ClampedArray
    | Int16Array
    | Uint16Array
    | Int32Array
    | Uint32Array
    | Float32Array
    | Float64Array
    | BigInt64Array
    | BigUint64Array;

/**
 * Fill a TypedArray with a default value, handling both number and bigint arrays.
 * Uses runtime type checking to call the correct fill signature.
 */
function fillTypedArray(
    array: AnyTypedArray,
    value: number | bigint,
    start?: number,
    end?: number
): void {
    if (array instanceof BigInt64Array || array instanceof BigUint64Array) {
        array.fill(value as bigint, start, end);
    } else {
        array.fill(value as number, start, end);
    }
}

/**
 * Copy data from one TypedArray to another using set().
 * Uses runtime type checking to handle bigint vs number arrays.
 */
function copyTypedArray(dest: AnyTypedArray, src: AnyTypedArray): void {
    if (dest instanceof BigInt64Array && src instanceof BigInt64Array) {
        dest.set(src);
    } else if (dest instanceof BigUint64Array && src instanceof BigUint64Array) {
        dest.set(src);
    } else if (
        !(dest instanceof BigInt64Array) &&
        !(dest instanceof BigUint64Array) &&
        !(src instanceof BigInt64Array) &&
        !(src instanceof BigUint64Array)
    ) {
        // Both are number-based TypedArrays
        dest.set(src);
    }
    // Mismatched types should never happen if schema is consistent
}

/**
 * Interface for strided array proxies used in AoS stores.
 * Internal type - not exported from the module.
 */
interface StridedArrayProxy {
    readonly length: number;
    readonly buffer: ArrayBuffer;
    readonly byteOffset: number;
    readonly byteLength: number;
    readonly BYTES_PER_ELEMENT: number;
    [index: number]: number | bigint;
    forEach(callback: (value: number | bigint, index: number) => void): void;
    fill(value: number | bigint, start?: number, end?: number): this;
    [Symbol.iterator](): Iterator<number | bigint>;
}

/**
 * Get a field's strided array proxy from an AoS store
 */
function getStridedProxy(store: TypedAoSStore, key: string): StridedArrayProxy {
    return store[key] as StridedArrayProxy;
}

/**
 * Get a field's TypedArray from a SoA store
 */
function getSoAArray(store: TypedSoAStore, key: string): AnyTypedArray {
    return store[key] as AnyTypedArray;
}

/**
 * Check if a store is a typed SoA store with capacity management
 */
export function isTypedStore(store: unknown): store is TypedSoAStore {
    return (
        typeof store === 'object' &&
        store !== null &&
        $typedStore in store &&
        (store as TypedSoAStore)[$typedStore] === true
    );
}

/**
 * Check if a store is a typed AoS (interleaved) store
 */
export function isTypedAoSStore(store: unknown): store is TypedAoSStore {
    return (
        typeof store === 'object' &&
        store !== null &&
        $typedAoSStore in store &&
        (store as TypedAoSStore)[$typedAoSStore] === true
    );
}

/**
 * Grow a typed SoA store to accommodate a minimum capacity
 */
export function growTypedSoAStore(store: TypedSoAStore, minCapacity: number): void {
    // Calculate new capacity (double until we have enough)
    let newCapacity = store._capacity;
    while (newCapacity < minCapacity) {
        newCapacity = Math.ceil(newCapacity * GROWTH_FACTOR);
    }

    const schema = store._schema;
    const BufferCtor = store._bufferType;

    // Grow each TypedArray
    for (const key in schema) {
        const field = schema[key];
        const ArrayConstructor = field[$typedArray];
        const oldArray = getSoAArray(store, key);
        // Create new TypedArray with same buffer type
        // Cast needed: TS lib types don't include SharedArrayBuffer overloads but runtime supports it
        const buffer = new BufferCtor(newCapacity * ArrayConstructor.BYTES_PER_ELEMENT);
        const newArray = new ArrayConstructor(buffer as ArrayBuffer);

        // Copy existing data
        copyTypedArray(newArray, oldArray);

        // Fill new slots with default value
        if (field.default !== 0 && field.default !== 0n) {
            fillTypedArray(newArray, field.default, oldArray.length);
        }

        store[key] = newArray;
    }

    store._capacity = newCapacity;
}

/**
 * Ensure a typed SoA store has capacity for the given index
 */
export function ensureTypedStoreCapacity(store: TypedSoAStore, index: number): void {
    if (index >= store._capacity) {
        growTypedSoAStore(store, index + 1);
    }
}

/**
 * Create a typed SoA store with TypedArrays
 */
export function createTypedSoAStore(
    schema: Record<string, TypedField>,
    options: TypedSoAStoreOptions = {}
): TypedSoAStore {
    const { bufferType: BufferCtor = ArrayBuffer } = options;

    const store: TypedSoAStore = {
        [$typedStore]: true,
        _capacity: INITIAL_CAPACITY,
        _schema: schema,
        _bufferType: BufferCtor,
    };

    for (const key in schema) {
        const field = schema[key];
        const ArrayConstructor = field[$typedArray];
        // Create TypedArray with specified buffer type
        // Cast needed: TS lib types don't include SharedArrayBuffer overloads but runtime supports it
        const buffer = new BufferCtor(INITIAL_CAPACITY * ArrayConstructor.BYTES_PER_ELEMENT);
        const array = new ArrayConstructor(buffer as ArrayBuffer);

        // Fill with default value if non-zero
        if (field.default !== 0 && field.default !== 0n) {
            fillTypedArray(array, field.default);
        }

        store[key] = array;
    }

    return store;
}

// ============================================================================
// Typed AoS (Interleaved) Store
// ============================================================================

/**
 * Create a typed AoS (interleaved) store with a single ArrayBuffer
 * Memory layout: [x0,y0,z0,pad, x1,y1,z1,pad, x2,y2,z2,pad, ...]
 */
export function createTypedAoSStore(
    template: Record<string, TypedField>,
    options: TypedAoSStoreOptions = {}
): TypedAoSStore {
    const { alignment = DEFAULT_ALIGNMENT, bufferType: BufferCtor = ArrayBuffer } = options;

    // Calculate offsets and stride (field order = memory order)
    let offset = 0;
    const offsets: Record<string, number> = {};

    for (const key in template) {
        const field = template[key];
        offsets[key] = offset;
        offset += field[$typedArray].BYTES_PER_ELEMENT;
    }

    // Align stride to boundary
    const stride = Math.ceil(offset / alignment) * alignment;

    // Allocate buffer with specified type
    const buffer = new BufferCtor(stride * INITIAL_CAPACITY);

    // Create store with metadata
    const store: TypedAoSStore = {
        [$typedAoSStore]: true,
        _capacity: INITIAL_CAPACITY,
        _template: template,
        _buffer: buffer,
        _stride: stride,
        _offsets: offsets,
        _alignment: alignment,
        _bufferType: BufferCtor,
    };

    // Create strided proxy views for each field
    for (const key in template) {
        const field = template[key];
        store[key] = createStridedArrayProxy(
            field[$typedArray],
            buffer,
            offsets[key],
            stride,
            INITIAL_CAPACITY
        );
    }

    // Fill with default values
    for (const key in template) {
        const field = template[key];
        if (field.default !== 0 && field.default !== 0n) {
            getStridedProxy(store, key).fill(field.default);
        }
    }

    return store;
}

/**
 * Grow a typed AoS (interleaved) store to accommodate a minimum capacity
 */
export function growTypedAoSStore(store: TypedAoSStore, minCapacity: number): void {
    // Calculate new capacity (double until we have enough)
    let newCapacity = store._capacity;
    while (newCapacity < minCapacity) {
        newCapacity = Math.ceil(newCapacity * GROWTH_FACTOR);
    }

    const {
        _template: template,
        _stride: stride,
        _offsets: offsets,
        _buffer: oldBuffer,
        _bufferType: BufferCtor,
    } = store;

    // Allocate new buffer with same type
    const newBuffer = new BufferCtor(stride * newCapacity);

    // Copy existing data
    new Uint8Array(newBuffer).set(new Uint8Array(oldBuffer));

    // Update buffer reference
    store._buffer = newBuffer;
    store._capacity = newCapacity;

    // Recreate strided proxy views
    for (const key in template) {
        const field = template[key];
        store[key] = createStridedArrayProxy(
            field[$typedArray],
            newBuffer,
            offsets[key],
            stride,
            newCapacity
        );
    }

    // Fill new slots with default values
    for (const key in template) {
        const field = template[key];
        if (field.default !== 0 && field.default !== 0n) {
            getStridedProxy(store, key).fill(field.default, store._capacity, newCapacity);
        }
    }
}

/**
 * Ensure a typed AoS store has capacity for the given index
 */
export function ensureTypedAoSStoreCapacity(store: TypedAoSStore, index: number): void {
    if (index >= store._capacity) {
        growTypedAoSStore(store, index + 1);
    }
}

/**
 * Creates a Proxy that provides strided array access into an interleaved buffer.
 * For index i, the byte offset is: byteOffset + (i * stride)
 */
function createStridedArrayProxy(
    ArrayCtor: TypedArrayConstructor,
    buffer: ArrayBuffer | SharedArrayBuffer,
    byteOffset: number,
    stride: number,
    capacity: number
): unknown {
    const bytesPerElement = ArrayCtor.BYTES_PER_ELEMENT;
    // DataView accepts both ArrayBuffer and SharedArrayBuffer
    const view = new DataView(buffer as ArrayBuffer);
    const { read, write } = getDataViewMethods(ArrayCtor);

    // We store capacity in a mutable object so it can be updated
    const meta = { capacity, buffer, view };

    const handler: ProxyHandler<number[]> = {
        get(_target, prop) {
            if (prop === 'length') return meta.capacity;
            if (prop === 'buffer') return meta.buffer;
            if (prop === 'byteOffset') return byteOffset;
            if (prop === 'byteLength') return meta.capacity * bytesPerElement;
            if (prop === 'BYTES_PER_ELEMENT') return bytesPerElement;

            // Symbol.iterator for for...of loops
            if (prop === Symbol.iterator) {
                return function* () {
                    for (let i = 0; i < meta.capacity; i++) {
                        yield read(meta.view, byteOffset + i * stride);
                    }
                };
            }

            // Array methods
            if (prop === 'forEach') {
                return (callback: (value: number | bigint, index: number) => void) => {
                    for (let i = 0; i < meta.capacity; i++) {
                        callback(read(meta.view, byteOffset + i * stride), i);
                    }
                };
            }

            if (prop === 'fill') {
                return (value: number | bigint, start = 0, end = meta.capacity) => {
                    for (let i = start; i < Math.min(end, meta.capacity); i++) {
                        write(meta.view, byteOffset + i * stride, value);
                    }
                    return proxy;
                };
            }

            // Numeric index access
            if (typeof prop === 'string' && !isNaN(Number(prop))) {
                const index = Number(prop);
                if (index >= 0 && index < meta.capacity) {
                    return read(meta.view, byteOffset + index * stride);
                }
                return undefined;
            }

            return undefined;
        },

        set(_target, prop, value) {
            if (typeof prop === 'string' && !isNaN(Number(prop))) {
                const index = Number(prop);
                if (index >= 0 && index < meta.capacity) {
                    write(meta.view, byteOffset + index * stride, value);
                    return true;
                }
            }
            return false;
        },

        has(_target, prop) {
            if (typeof prop === 'string' && !isNaN(Number(prop))) {
                const index = Number(prop);
                return index >= 0 && index < meta.capacity;
            }
            return false;
        },
    };

    const proxy = new Proxy([] as number[], handler);
    return proxy;
}

/**
 * Gets DataView read/write methods for a TypedArray type
 */
function getDataViewMethods(ArrayCtor: TypedArrayConstructor): {
    read: (view: DataView, offset: number) => number | bigint;
    write: (view: DataView, offset: number, value: number | bigint) => void;
} {
    const littleEndian = true;

    switch (ArrayCtor) {
        case Float32Array:
            return {
                read: (v, o) => v.getFloat32(o, littleEndian),
                write: (v, o, val) => v.setFloat32(o, val as number, littleEndian),
            };
        case Float64Array:
            return {
                read: (v, o) => v.getFloat64(o, littleEndian),
                write: (v, o, val) => v.setFloat64(o, val as number, littleEndian),
            };
        case Int8Array:
            return {
                read: (v, o) => v.getInt8(o),
                write: (v, o, val) => v.setInt8(o, val as number),
            };
        case Int16Array:
            return {
                read: (v, o) => v.getInt16(o, littleEndian),
                write: (v, o, val) => v.setInt16(o, val as number, littleEndian),
            };
        case Int32Array:
            return {
                read: (v, o) => v.getInt32(o, littleEndian),
                write: (v, o, val) => v.setInt32(o, val as number, littleEndian),
            };
        case BigInt64Array:
            return {
                read: (v, o) => v.getBigInt64(o, littleEndian),
                write: (v, o, val) => v.setBigInt64(o, val as bigint, littleEndian),
            };
        case Uint8Array:
            return {
                read: (v, o) => v.getUint8(o),
                write: (v, o, val) => v.setUint8(o, val as number),
            };
        case Uint8ClampedArray:
            // Uint8ClampedArray uses same DataView methods as Uint8Array
            // Clamping behavior only applies to direct array assignment
            return {
                read: (v, o) => v.getUint8(o),
                write: (v, o, val) => v.setUint8(o, Math.max(0, Math.min(255, val as number))),
            };
        case Uint16Array:
            return {
                read: (v, o) => v.getUint16(o, littleEndian),
                write: (v, o, val) => v.setUint16(o, val as number, littleEndian),
            };
        case Uint32Array:
            return {
                read: (v, o) => v.getUint32(o, littleEndian),
                write: (v, o, val) => v.setUint32(o, val as number, littleEndian),
            };
        case BigUint64Array:
            return {
                read: (v, o) => v.getBigUint64(o, littleEndian),
                write: (v, o, val) => v.setBigUint64(o, val as bigint, littleEndian),
            };
        default:
            throw new Error(`Unsupported TypedArray type: ${ArrayCtor.name}`);
    }
}

export function createStore<T extends Schema>(schema: T): Store<T>;
export function createStore(schema: Schema): unknown {
    if (typeof schema === 'function') {
        // AoS - array of instances
        return [];
    } else if (isTypedSchema(schema)) {
        // Typed SoA - TypedArrays with capacity management
        return createTypedSoAStore(schema as Record<string, TypedField>);
    } else {
        // Regular SoA - JS arrays
        const store: Record<string, unknown[]> = {};

        for (const key in schema) {
            store[key] = [];
        }

        return store;
    }
}
