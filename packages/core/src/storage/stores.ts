import { $typedArray, isTypedSchema, type TypedField } from '../types';
import { $bufferStore, type Schema, type Store, type BufferStore, type BufferStoreOptions } from './types';

/** Initial capacity for typed stores */
const INITIAL_CAPACITY = 8;

/** Growth factor when typed stores need to expand */
const GROWTH_FACTOR = 2;

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
 * Get a field's TypedArray from a buffer store
 */
function getBufferArray(store: BufferStore, key: string): AnyTypedArray {
    return store[key] as AnyTypedArray;
}

/**
 * Check if a store is a buffer store with capacity management
 */
export function isBufferStore(store: unknown): store is BufferStore {
    return (
        typeof store === 'object' &&
        store !== null &&
        $bufferStore in store &&
        (store as BufferStore)[$bufferStore] === true
    );
}

/**
 * Grow a buffer store to accommodate a minimum capacity
 */
export function growBufferStore(store: BufferStore, minCapacity: number): void {
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
        const oldArray = getBufferArray(store, key);
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
 * Ensure a buffer store has capacity for the given index
 */
export function ensureBufferCapacity(store: BufferStore, index: number): void {
    if (index >= store._capacity) {
        growBufferStore(store, index + 1);
    }
}

/**
 * Create a buffer store with TypedArrays
 */
export function createBufferStore(
    schema: Record<string, TypedField>,
    options: BufferStoreOptions = {}
): BufferStore {
    const { bufferType: BufferCtor = ArrayBuffer } = options;

    const store: BufferStore = {
        [$bufferStore]: true,
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

export function createStore<T extends Schema>(schema: T): Store<T>;
export function createStore(schema: Schema): unknown {
    if (typeof schema === 'function') {
        // AoS - array of instances
        return [];
    } else if (isTypedSchema(schema)) {
        // Buffer - TypedArrays with capacity management
        return createBufferStore(schema as Record<string, TypedField>);
    } else {
        // Regular SoA - JS arrays
        const store: Record<string, unknown[]> = {};

        for (const key in schema) {
            store[key] = [];
        }

        return store;
    }
}
