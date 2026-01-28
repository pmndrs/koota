/**
 * @file interleaved-trait.ts
 * @description Single-trait interleaved storage implementation
 *
 * Unlike SoA (typedTrait) where each field is a separate array:
 *   x: [x0, x1, x2, ...]
 *   y: [y0, y1, y2, ...]
 *
 * Interleaved storage packs fields together per entity:
 *   buffer: [x0, y0, x1, y1, x2, y2, ...]
 *
 * This is GPU-friendly for single-attribute buffers.
 */

import {
  type FieldGroup,
  type FieldGroupRecord,
  type FieldGroupStore,
  type InterleavedTrait,
  type InterleavedTraitOptions,
  type TypedArrayConstructor,
  INTERLEAVED_TRAIT_SYMBOL,
  getBytesPerElement,
  isTypedArrayConstructor,
} from './types'

let interleavedTraitId = 0

/**
 * Creates a single-trait with interleaved storage.
 *
 * @example
 * ```ts
 * const Position = interleavedTrait({
 *   x: Float32Array,
 *   y: Float32Array,
 *   z: Float32Array,
 * })
 *
 * // Memory layout: [x0,y0,z0, x1,y1,z1, x2,y2,z2, ...]
 * // Position.stride = 12 (3 × 4 bytes)
 * // Position.buffer is the raw ArrayBuffer
 * ```
 */
export function interleavedTrait<S extends FieldGroup>(
  schema: S,
  options: InterleavedTraitOptions = {}
): InterleavedTrait<S> {
  const {
    capacity: initialCapacity = 1000,
    maxCapacity,
    growthFactor = 2,
    defaults = {},
  } = options

  // Validate schema
  const fieldNames = Object.keys(schema) as (keyof S)[]
  if (fieldNames.length === 0) {
    throw new Error('InterleavedTrait schema must have at least one field')
  }

  for (const field of fieldNames) {
    if (!isTypedArrayConstructor(schema[field])) {
      throw new Error(`Field "${String(field)}" must be a TypedArray constructor`)
    }
  }

  // Calculate stride and offsets
  const offsets = {} as { [K in keyof S]: number }
  let stride = 0

  for (const field of fieldNames) {
    offsets[field] = stride
    stride += getBytesPerElement(schema[field])
  }

  // Allocate buffer
  let buffer = new ArrayBuffer(stride * initialCapacity)
  let capacity = initialCapacity

  // Create store with TypedArray views
  // These views stride over the buffer to access each field
  const store = createInterleavedStore(schema, fieldNames, offsets, stride, buffer, capacity)

  const id = interleavedTraitId++

  // The trait function
  const trait = ((params?: Partial<FieldGroupRecord<S>>) => {
    return [trait, params ?? {}] as [InterleavedTrait<S>, Partial<FieldGroupRecord<S>>]
  }) as InterleavedTrait<S>

  // Attach properties
  Object.defineProperties(trait, {
    [INTERLEAVED_TRAIT_SYMBOL]: { value: true, writable: false },
    id: { value: id, writable: false, enumerable: true },
    schema: { value: schema, writable: false, enumerable: true },
    buffer: {
      get: () => buffer,
      enumerable: true,
    },
    stride: { value: stride, writable: false, enumerable: true },
    offsets: { value: offsets, writable: false, enumerable: true },
    capacity: {
      get: () => capacity,
      enumerable: true,
    },
    store: { value: store, writable: false, enumerable: true },
    defaults: { value: defaults, writable: false, enumerable: true },
  })

  // Add internal methods for growth
  ;(trait as any)._grow = (minCapacity: number) => {
    let newCapacity = capacity
    while (newCapacity < minCapacity) {
      newCapacity = Math.ceil(newCapacity * growthFactor)
    }

    if (maxCapacity !== undefined && newCapacity > maxCapacity) {
      if (minCapacity > maxCapacity) {
        throw new Error(
          `InterleavedTrait capacity exceeded. Required: ${minCapacity}, Max: ${maxCapacity}`
        )
      }
      newCapacity = maxCapacity
    }

    // Allocate new buffer
    const newBuffer = new ArrayBuffer(stride * newCapacity)

    // Copy existing data
    new Uint8Array(newBuffer).set(new Uint8Array(buffer))

    // Update references
    buffer = newBuffer
    capacity = newCapacity

    // Recreate store views
    const newStore = createInterleavedStore(schema, fieldNames, offsets, stride, buffer, capacity)
    for (const field of fieldNames) {
      ;(store as any)[field] = newStore[field]
    }
  }

  return trait
}

/**
 * Creates TypedArray views that stride over an interleaved buffer.
 *
 * TYPE CHALLENGE: Creating strided TypedArray views is tricky because
 * TypedArrays don't natively support striding. We use a Proxy to simulate
 * array-like access with the correct stride.
 */
function createInterleavedStore<S extends FieldGroup>(
  schema: S,
  fieldNames: (keyof S)[],
  offsets: { [K in keyof S]: number },
  stride: number,
  buffer: ArrayBuffer,
  capacity: number
): FieldGroupStore<S> {
  const store = {} as FieldGroupStore<S>

  for (const field of fieldNames) {
    const ArrayCtor = schema[field]
    const byteOffset = offsets[field]
    const bytesPerElement = getBytesPerElement(ArrayCtor)

    // Create a proxy that simulates strided array access
    // This allows store.x[i] to access the correct byte offset
    const proxy = createStridedArrayProxy(
      ArrayCtor,
      buffer,
      byteOffset,
      stride,
      capacity,
      bytesPerElement
    )

    store[field] = proxy as FieldGroupStore<S>[keyof S]
  }

  return store
}

/**
 * Creates a Proxy that provides strided array access into an interleaved buffer.
 *
 * For index i, the byte offset is: byteOffset + (i * stride)
 *
 * TYPE CHALLENGE: The proxy needs to look like a TypedArray but internally
 * uses strided access. We implement common array operations (get, set, length)
 * but this won't have all TypedArray methods.
 */
function createStridedArrayProxy(
  ArrayCtor: TypedArrayConstructor,
  buffer: ArrayBuffer,
  byteOffset: number,
  stride: number,
  capacity: number,
  bytesPerElement: number
): any {
  // Create a DataView for flexible access
  const view = new DataView(buffer)

  // Determine read/write methods based on type
  const { read, write } = getDataViewMethods(ArrayCtor)

  // We need to capture a reference to the proxy for methods that return `this`
  let proxy: any

  const handler: ProxyHandler<number[]> = {
    get(target, prop, receiver) {
      if (prop === 'length') return capacity
      if (prop === 'buffer') return buffer
      if (prop === 'byteOffset') return byteOffset
      if (prop === 'byteLength') return capacity * bytesPerElement
      if (prop === 'BYTES_PER_ELEMENT') return bytesPerElement

      // Symbol.iterator for for...of loops
      if (prop === Symbol.iterator) {
        return function* () {
          for (let i = 0; i < capacity; i++) {
            yield read(view, byteOffset + i * stride)
          }
        }
      }

      // Array methods that make sense for strided access
      if (prop === 'forEach') {
        return (callback: (value: number, index: number) => void) => {
          for (let i = 0; i < capacity; i++) {
            callback(read(view, byteOffset + i * stride), i)
          }
        }
      }

      if (prop === 'fill') {
        return (value: number, start = 0, end = capacity) => {
          for (let i = start; i < end; i++) {
            write(view, byteOffset + i * stride, value)
          }
          return receiver // Return the proxy for chaining
        }
      }

      // Numeric index access
      if (typeof prop === 'string' && !isNaN(Number(prop))) {
        const index = Number(prop)
        if (index >= 0 && index < capacity) {
          return read(view, byteOffset + index * stride)
        }
        return undefined
      }

      return undefined
    },

    set(target, prop, value) {
      if (typeof prop === 'string' && !isNaN(Number(prop))) {
        const index = Number(prop)
        if (index >= 0 && index < capacity) {
          write(view, byteOffset + index * stride, value)
          return true
        }
      }
      return false
    },

    has(target, prop) {
      if (typeof prop === 'string' && !isNaN(Number(prop))) {
        const index = Number(prop)
        return index >= 0 && index < capacity
      }
      return prop in target
    },
  }

  proxy = new Proxy([] as number[], handler)
  return proxy
}

/**
 * Gets DataView read/write methods for a TypedArray type
 */
function getDataViewMethods(ArrayCtor: TypedArrayConstructor): {
  read: (view: DataView, offset: number) => number
  write: (view: DataView, offset: number, value: number) => void
} {
  // Little-endian for consistency
  const littleEndian = true

  switch (ArrayCtor) {
    case Float32Array:
      return {
        read: (v, o) => v.getFloat32(o, littleEndian),
        write: (v, o, val) => v.setFloat32(o, val, littleEndian),
      }
    case Float64Array:
      return {
        read: (v, o) => v.getFloat64(o, littleEndian),
        write: (v, o, val) => v.setFloat64(o, val, littleEndian),
      }
    case Int8Array:
      return {
        read: (v, o) => v.getInt8(o),
        write: (v, o, val) => v.setInt8(o, val),
      }
    case Int16Array:
      return {
        read: (v, o) => v.getInt16(o, littleEndian),
        write: (v, o, val) => v.setInt16(o, val, littleEndian),
      }
    case Int32Array:
      return {
        read: (v, o) => v.getInt32(o, littleEndian),
        write: (v, o, val) => v.setInt32(o, val, littleEndian),
      }
    case Uint8Array:
      return {
        read: (v, o) => v.getUint8(o),
        write: (v, o, val) => v.setUint8(o, val),
      }
    case Uint16Array:
      return {
        read: (v, o) => v.getUint16(o, littleEndian),
        write: (v, o, val) => v.setUint16(o, val, littleEndian),
      }
    case Uint32Array:
      return {
        read: (v, o) => v.getUint32(o, littleEndian),
        write: (v, o, val) => v.setUint32(o, val, littleEndian),
      }
    default:
      throw new Error(`Unsupported TypedArray type: ${ArrayCtor.name}`)
  }
}

/**
 * Check if a value is an interleaved trait
 */
export function isInterleavedTrait<S extends FieldGroup>(
  value: unknown
): value is InterleavedTrait<S> {
  return (
    typeof value === 'function' &&
    (value as any)[INTERLEAVED_TRAIT_SYMBOL] === true
  )
}

/**
 * Set values for an entity in an interleaved trait
 */
export function setInterleavedTraitValues<S extends FieldGroup>(
  trait: InterleavedTrait<S>,
  index: number,
  values: Partial<FieldGroupRecord<S>>
): void {
  // Grow if needed
  if (index >= trait.capacity) {
    ;(trait as any)._grow(index + 1)
  }

  const { store } = trait
  for (const [field, value] of Object.entries(values)) {
    if (field in store && value !== undefined) {
      ;(store as any)[field][index] = value
    }
  }
}

/**
 * Get values for an entity from an interleaved trait
 */
export function getInterleavedTraitValues<S extends FieldGroup>(
  trait: InterleavedTrait<S>,
  index: number
): FieldGroupRecord<S> {
  const { store, schema } = trait
  const record = {} as FieldGroupRecord<S>

  for (const field of Object.keys(schema)) {
    record[field as keyof S] = (store as any)[field][index]
  }

  return record
}

/**
 * Reset an entity's values to defaults
 */
export function resetInterleavedTraitValues<S extends FieldGroup>(
  trait: InterleavedTrait<S>,
  index: number
): void {
  const { store, schema, defaults } = trait

  for (const field of Object.keys(schema)) {
    const defaultValue = (defaults as any)[field] ?? 0
    ;(store as any)[field][index] = defaultValue
  }
}
