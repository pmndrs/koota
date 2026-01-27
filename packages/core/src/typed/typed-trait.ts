/**
 * @file typed-trait.ts
 * @description TypedArray-backed traits for high-performance SoA storage
 * 
 * This extension enables traits to use TypedArrays as their backing store,
 * providing cache-coherent iteration and zero-copy compatibility with GPU buffers.
 * 
 * @example
 * ```ts
 * const Position = trait.typed({
 *   x: Float32Array,
 *   y: Float32Array,
 *   z: Float32Array,
 * }, {
 *   maxEntities: 10000,
 *   defaults: { x: 0, y: 0, z: 0 }
 * })
 * 
 * // Usage is the same as regular traits
 * const entity = world.spawn(Position({ x: 100, y: 200 }))
 * 
 * // But the store is SoA TypedArrays for bulk operations
 * const store = getStore(world, Position)
 * for (const eid of query(world, Position)) {
 *   store.x[eid] += store.vx[eid] * delta
 *   store.y[eid] += store.vy[eid] * delta
 * }
 * ```
 */

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
  | Uint16ArrayConstructor
  | Uint32ArrayConstructor
  | BigInt64ArrayConstructor
  | BigUint64ArrayConstructor

/** Instance type of a TypedArray constructor */
export type TypedArrayInstance<T extends TypedArrayConstructor> = InstanceType<T>

/** Schema defining the structure of a typed trait */
export interface TypedTraitSchema {
  [key: string]: TypedArrayConstructor
}

/** Extract the element type from a TypedArray constructor */
type ElementType<T extends TypedArrayConstructor> = 
  T extends Float32ArrayConstructor | Float64ArrayConstructor ? number :
  T extends Int8ArrayConstructor | Int16ArrayConstructor | Int32ArrayConstructor ? number :
  T extends Uint8ArrayConstructor | Uint16ArrayConstructor | Uint32ArrayConstructor ? number :
  T extends BigInt64ArrayConstructor | BigUint64ArrayConstructor ? bigint :
  never

/** Convert schema to defaults type */
export type TypedTraitDefaults<T extends TypedTraitSchema> = {
  [K in keyof T]?: ElementType<T[K]>
}

/** Convert schema to record type (what entity.get() returns) */
export type TypedTraitRecord<T extends TypedTraitSchema> = {
  [K in keyof T]: ElementType<T[K]>
}

/** Convert schema to store type (what getStore() returns) */
export type TypedTraitStore<T extends TypedTraitSchema> = {
  [K in keyof T]: TypedArrayInstance<T[K]>
}

/** Options for creating a typed trait */
export interface TypedTraitOptions<T extends TypedTraitSchema> {
  /** 
   * Initial capacity (number of entities). 
   * Arrays will grow automatically if exceeded.
   * @default 1000 
   */
  initialCapacity?: number
  
  /** 
   * Maximum capacity. If set, arrays will not grow beyond this.
   * Attempting to add more entities will throw an error.
   * @default undefined (unlimited growth)
   */
  maxCapacity?: number
  
  /** 
   * Default values for each field when an entity is added.
   * Fields not specified default to 0.
   */
  defaults?: TypedTraitDefaults<T>
  
  /** 
   * Growth factor when arrays need to expand.
   * @default 2 
   */
  growthFactor?: number
}

/** Symbol to identify typed traits */
export const TYPED_TRAIT_SYMBOL = Symbol('TypedTrait')

/** Metadata attached to typed traits */
export interface TypedTraitMetadata<T extends TypedTraitSchema> {
  [TYPED_TRAIT_SYMBOL]: true
  schema: T
  store: TypedTraitStore<T>
  capacity: number
  maxCapacity: number | undefined
  growthFactor: number
  defaults: TypedTraitDefaults<T>
  fieldNames: (keyof T)[]
  fieldOffsets: Map<keyof T, number>
  totalSize: number // Total bytes per entity
}

/** A typed trait with its metadata */
export type TypedTrait<T extends TypedTraitSchema> = 
  & ((initial?: Partial<TypedTraitRecord<T>>) => TypedTraitInitializer<T>)
  & TypedTraitMetadata<T>

/** Initializer returned when calling a typed trait as a function */
export interface TypedTraitInitializer<T extends TypedTraitSchema> {
  trait: TypedTrait<T>
  initial: Partial<TypedTraitRecord<T>>
}

// ============================================================================
// Implementation
// ============================================================================

/**
 * Creates a typed trait with TypedArray backing storage.
 * 
 * Unlike regular traits which use AoS (Array of Structures) storage,
 * typed traits use SoA (Structure of Arrays) storage where each field
 * is stored in its own contiguous TypedArray.
 * 
 * Benefits:
 * - Cache-coherent iteration when accessing single fields across many entities
 * - Direct compatibility with GPU buffer uploads (no marshalling needed)
 * - Predictable memory layout
 * - Better performance for bulk operations
 * 
 * Trade-offs:
 * - All fields must be numeric (TypedArray elements)
 * - Accessing multiple fields of one entity is slightly less cache-friendly
 * - Memory is pre-allocated based on capacity
 * 
 * @param schema - Object mapping field names to TypedArray constructors
 * @param options - Configuration options
 * @returns A typed trait that can be used with Koota's standard API
 */
export function typedTrait<T extends TypedTraitSchema>(
  schema: T,
  options: TypedTraitOptions<T> = {}
): TypedTrait<T> {
  const {
    initialCapacity = 1000,
    maxCapacity,
    defaults = {} as TypedTraitDefaults<T>,
    growthFactor = 2,
  } = options

  // Validate schema
  const fieldNames = Object.keys(schema) as (keyof T)[]
  if (fieldNames.length === 0) {
    throw new Error('TypedTrait schema must have at least one field')
  }

  // Calculate field offsets for potential interleaved access
  const fieldOffsets = new Map<keyof T, number>()
  let totalSize = 0
  for (const field of fieldNames) {
    fieldOffsets.set(field, totalSize)
    totalSize += getBytesPerElement(schema[field])
  }

  // Create the store with pre-allocated TypedArrays
  const store = createStore(schema, initialCapacity, defaults)

  // Create the trait function
  const traitFn = (initial?: Partial<TypedTraitRecord<T>>): TypedTraitInitializer<T> => {
    return {
      trait: traitFn as TypedTrait<T>,
      initial: initial ?? {},
    }
  }

  // Attach metadata
  const metadata: TypedTraitMetadata<T> = {
    [TYPED_TRAIT_SYMBOL]: true,
    schema,
    store,
    capacity: initialCapacity,
    maxCapacity,
    growthFactor,
    defaults,
    fieldNames,
    fieldOffsets,
    totalSize,
  }

  return Object.assign(traitFn, metadata) as TypedTrait<T>
}

/**
 * Creates the SoA store for a typed trait
 */
function createStore<T extends TypedTraitSchema>(
  schema: T,
  capacity: number,
  defaults: TypedTraitDefaults<T>
): TypedTraitStore<T> {
  const store = {} as TypedTraitStore<T>
  
  for (const [field, ArrayConstructor] of Object.entries(schema)) {
    const array = new ArrayConstructor(capacity)
    
    // Fill with default value if provided
    const defaultValue = defaults[field as keyof T]
    if (defaultValue !== undefined) {
      array.fill(defaultValue as never)
    }
    
    store[field as keyof T] = array as TypedTraitStore<T>[keyof T]
  }
  
  return store
}

/**
 * Gets the bytes per element for a TypedArray constructor
 */
function getBytesPerElement(ArrayConstructor: TypedArrayConstructor): number {
  return ArrayConstructor.BYTES_PER_ELEMENT
}

/**
 * Checks if a trait is a typed trait
 */
export function isTypedTrait<T extends TypedTraitSchema>(
  trait: unknown
): trait is TypedTrait<T> {
  return (
    typeof trait === 'function' &&
    (trait as any)[TYPED_TRAIT_SYMBOL] === true
  )
}

/**
 * Grows the store arrays to accommodate more entities
 */
export function growTypedTraitStore<T extends TypedTraitSchema>(
  trait: TypedTrait<T>,
  minCapacity: number
): void {
  const { store, schema, capacity, maxCapacity, growthFactor, defaults } = trait
  
  // Calculate new capacity
  let newCapacity = capacity
  while (newCapacity < minCapacity) {
    newCapacity = Math.ceil(newCapacity * growthFactor)
  }
  
  // Check max capacity
  if (maxCapacity !== undefined && newCapacity > maxCapacity) {
    if (minCapacity > maxCapacity) {
      throw new Error(
        `TypedTrait capacity exceeded. Required: ${minCapacity}, Max: ${maxCapacity}`
      )
    }
    newCapacity = maxCapacity
  }
  
  // Grow each array
  for (const field of Object.keys(schema) as (keyof T)[]) {
    const ArrayConstructor = schema[field]
    const oldArray = store[field]
    const newArray = new ArrayConstructor(newCapacity)
    
    // Copy existing data
    newArray.set(oldArray as any)
    
    // Fill new space with defaults
    const defaultValue = defaults[field]
    if (defaultValue !== undefined) {
      for (let i = capacity; i < newCapacity; i++) {
        (newArray as any)[i] = defaultValue
      }
    }
    
    store[field] = newArray as TypedTraitStore<T>[keyof T]
  }
  
  // Update capacity
  ;(trait as any).capacity = newCapacity
}

/**
 * Sets values for an entity in a typed trait store
 */
export function setTypedTraitValues<T extends TypedTraitSchema>(
  trait: TypedTrait<T>,
  entityId: number,
  values: Partial<TypedTraitRecord<T>>
): void {
  const { store, capacity } = trait
  
  // Grow if needed
  if (entityId >= capacity) {
    growTypedTraitStore(trait, entityId + 1)
  }
  
  // Set values
  for (const [field, value] of Object.entries(values)) {
    if (field in store && value !== undefined) {
      (store[field as keyof T] as any)[entityId] = value
    }
  }
}

/**
 * Gets values for an entity from a typed trait store
 * Returns a snapshot object (not a live view)
 */
export function getTypedTraitValues<T extends TypedTraitSchema>(
  trait: TypedTrait<T>,
  entityId: number
): TypedTraitRecord<T> {
  const { store, fieldNames } = trait
  
  const record = {} as TypedTraitRecord<T>
  for (const field of fieldNames) {
    record[field] = (store[field] as any)[entityId]
  }
  
  return record
}

/**
 * Resets an entity's values to defaults in a typed trait store
 */
export function resetTypedTraitValues<T extends TypedTraitSchema>(
  trait: TypedTrait<T>,
  entityId: number
): void {
  const { store, fieldNames, defaults } = trait
  
  for (const field of fieldNames) {
    const defaultValue = defaults[field] ?? 0
    ;(store[field] as any)[entityId] = defaultValue
  }
}

/**
 * Copies values from one entity to another
 */
export function copyTypedTraitValues<T extends TypedTraitSchema>(
  trait: TypedTrait<T>,
  sourceId: number,
  targetId: number
): void {
  const { store, fieldNames, capacity } = trait
  
  // Grow if needed
  if (targetId >= capacity) {
    growTypedTraitStore(trait, targetId + 1)
  }
  
  for (const field of fieldNames) {
    (store[field] as any)[targetId] = (store[field] as any)[sourceId]
  }
}

/**
 * Swaps values between two entities (useful for defragmentation)
 */
export function swapTypedTraitValues<T extends TypedTraitSchema>(
  trait: TypedTrait<T>,
  entityA: number,
  entityB: number
): void {
  const { store, fieldNames } = trait
  
  for (const field of fieldNames) {
    const array = store[field] as any
    const temp = array[entityA]
    array[entityA] = array[entityB]
    array[entityB] = temp
  }
}

// ============================================================================
// Interleaved Buffer Export (for GPU upload)
// ============================================================================

export interface InterleavedBufferLayout {
  /** Total bytes per entity */
  stride: number
  /** Field offsets within the interleaved buffer */
  offsets: Map<string, number>
  /** Field sizes in bytes */
  sizes: Map<string, number>
}

/**
 * Gets the layout for an interleaved buffer representation
 */
export function getInterleavedLayout<T extends TypedTraitSchema>(
  trait: TypedTrait<T>
): InterleavedBufferLayout {
  const { schema, fieldNames } = trait
  
  const offsets = new Map<string, number>()
  const sizes = new Map<string, number>()
  let stride = 0
  
  for (const field of fieldNames) {
    const bytes = getBytesPerElement(schema[field])
    offsets.set(field as string, stride)
    sizes.set(field as string, bytes)
    stride += bytes
  }
  
  return { stride, offsets, sizes }
}

/**
 * Packs entity data into an interleaved buffer for GPU upload
 * 
 * @param trait - The typed trait
 * @param entityIds - Array of entity IDs to pack
 * @param target - Optional target buffer (will be created if not provided)
 * @returns The interleaved Float32Array buffer
 */
export function packToInterleavedBuffer<T extends TypedTraitSchema>(
  trait: TypedTrait<T>,
  entityIds: number[],
  target?: Float32Array
): Float32Array {
  const { store, fieldNames, schema } = trait
  
  // Calculate stride in float32 elements
  let strideFloats = 0
  for (const field of fieldNames) {
    const bytes = getBytesPerElement(schema[field])
    strideFloats += bytes / 4 // Assuming we're packing to float32
  }
  
  // Create or validate target buffer
  const requiredSize = entityIds.length * strideFloats
  if (target) {
    if (target.length < requiredSize) {
      throw new Error(
        `Target buffer too small. Required: ${requiredSize}, Got: ${target.length}`
      )
    }
  } else {
    target = new Float32Array(requiredSize)
  }
  
  // Pack data
  for (let i = 0; i < entityIds.length; i++) {
    const eid = entityIds[i]
    let offset = i * strideFloats
    
    for (const field of fieldNames) {
      const value = (store[field] as any)[eid]
      target[offset++] = value
    }
  }
  
  return target
}

/**
 * Packs a subset of fields into an interleaved buffer
 */
export function packFieldsToInterleavedBuffer<T extends TypedTraitSchema>(
  trait: TypedTrait<T>,
  fields: (keyof T)[],
  entityIds: number[],
  target?: Float32Array
): Float32Array {
  const { store, schema } = trait
  
  // Calculate stride
  let strideFloats = 0
  for (const field of fields) {
    const bytes = getBytesPerElement(schema[field])
    strideFloats += bytes / 4
  }
  
  // Create or validate target
  const requiredSize = entityIds.length * strideFloats
  if (target) {
    if (target.length < requiredSize) {
      throw new Error(
        `Target buffer too small. Required: ${requiredSize}, Got: ${target.length}`
      )
    }
  } else {
    target = new Float32Array(requiredSize)
  }
  
  // Pack data
  for (let i = 0; i < entityIds.length; i++) {
    const eid = entityIds[i]
    let offset = i * strideFloats
    
    for (const field of fields) {
      const value = (store[field] as any)[eid]
      target[offset++] = value
    }
  }
  
  return target
}
