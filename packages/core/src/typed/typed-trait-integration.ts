/**
 * @file typed-trait-integration.ts
 * @description Integration layer for typed traits with Koota's existing APIs
 * 
 * This file contains the modifications/extensions needed to integrate
 * TypedTraits with Koota's world, entity, and query systems.
 */

import {
  TypedTrait,
  TypedTraitSchema,
  TypedTraitRecord,
  TypedTraitStore,
  isTypedTrait,
  setTypedTraitValues,
  getTypedTraitValues,
  resetTypedTraitValues,
  growTypedTraitStore,
  TYPED_TRAIT_SYMBOL,
} from './typed-trait'

// ============================================================================
// Type Extensions for Koota
// ============================================================================

/**
 * Extended trait type that can be either a regular trait or typed trait
 */
export type AnyTrait = 
  | RegularTrait<any>
  | TypedTrait<any>

/**
 * Placeholder for regular Koota trait (from existing implementation)
 */
export interface RegularTrait<T> {
  (initial?: Partial<T>): { trait: RegularTrait<T>; initial: Partial<T> }
  // ... existing trait properties
}

/**
 * Infer the record type from any trait
 */
export type InferTraitRecord<T> = 
  T extends TypedTrait<infer S> ? TypedTraitRecord<S> :
  T extends RegularTrait<infer R> ? R :
  never

/**
 * Infer the store type from any trait
 */
export type InferTraitStore<T> = 
  T extends TypedTrait<infer S> ? TypedTraitStore<S> :
  T extends RegularTrait<infer R> ? R[] :
  never

// ============================================================================
// World Extensions
// ============================================================================

/**
 * Registry for typed trait stores per world
 * Maps world ID -> trait -> store reference
 */
const worldTypedTraitStores = new WeakMap<
  object, // World instance
  Map<TypedTrait<any>, TypedTraitStore<any>>
>()

/**
 * Registers a typed trait with a world
 * This ensures each world can have its own store for the trait
 */
export function registerTypedTraitWithWorld<T extends TypedTraitSchema>(
  world: object,
  trait: TypedTrait<T>
): TypedTraitStore<T> {
  let worldStores = worldTypedTraitStores.get(world)
  
  if (!worldStores) {
    worldStores = new Map()
    worldTypedTraitStores.set(world, worldStores)
  }
  
  // Check if already registered
  if (worldStores.has(trait)) {
    return worldStores.get(trait)!
  }
  
  // For now, typed traits share their store globally
  // This is a design decision - could also clone stores per world
  worldStores.set(trait, trait.store)
  
  return trait.store
}

/**
 * Gets the store for a typed trait in a specific world
 */
export function getTypedTraitStoreForWorld<T extends TypedTraitSchema>(
  world: object,
  trait: TypedTrait<T>
): TypedTraitStore<T> | undefined {
  const worldStores = worldTypedTraitStores.get(world)
  return worldStores?.get(trait)
}

// ============================================================================
// Entity Operations
// ============================================================================

/**
 * Adds a typed trait to an entity
 */
export function addTypedTraitToEntity<T extends TypedTraitSchema>(
  world: object,
  entityId: number,
  trait: TypedTrait<T>,
  initialValues?: Partial<TypedTraitRecord<T>>
): void {
  // Ensure trait is registered with world
  registerTypedTraitWithWorld(world, trait)
  
  // Ensure capacity
  if (entityId >= trait.capacity) {
    growTypedTraitStore(trait, entityId + 1)
  }
  
  // Set default values first
  resetTypedTraitValues(trait, entityId)
  
  // Apply initial values if provided
  if (initialValues) {
    setTypedTraitValues(trait, entityId, initialValues)
  }
}

/**
 * Removes a typed trait from an entity
 * Note: For typed traits, we just reset to defaults rather than deallocating
 */
export function removeTypedTraitFromEntity<T extends TypedTraitSchema>(
  trait: TypedTrait<T>,
  entityId: number
): void {
  resetTypedTraitValues(trait, entityId)
}

/**
 * Sets typed trait values for an entity
 */
export function setEntityTypedTrait<T extends TypedTraitSchema>(
  trait: TypedTrait<T>,
  entityId: number,
  values: Partial<TypedTraitRecord<T>>
): void {
  setTypedTraitValues(trait, entityId, values)
}

/**
 * Gets typed trait values for an entity
 * Returns a snapshot (not a live reference)
 */
export function getEntityTypedTrait<T extends TypedTraitSchema>(
  trait: TypedTrait<T>,
  entityId: number
): TypedTraitRecord<T> {
  return getTypedTraitValues(trait, entityId)
}

// ============================================================================
// Query Support
// ============================================================================

/**
 * Result of a typed trait query iteration
 * Provides both entity IDs and direct store access
 */
export interface TypedQueryResult<T extends TypedTraitSchema> {
  /** Entity IDs matching the query */
  entities: number[]
  
  /** Direct store access for bulk operations */
  store: TypedTraitStore<T>
  
  /** Iterate over entities with their values */
  forEach(callback: (record: TypedTraitRecord<T>, entityId: number) => void): void
  
  /** Update each entity's values */
  updateEach(callback: (record: TypedTraitRecord<T>, entityId: number) => Partial<TypedTraitRecord<T>> | void): void
  
  /** Map entities to new values */
  map<R>(callback: (record: TypedTraitRecord<T>, entityId: number) => R): R[]
}

/**
 * Creates a typed query result
 */
export function createTypedQueryResult<T extends TypedTraitSchema>(
  trait: TypedTrait<T>,
  entityIds: number[]
): TypedQueryResult<T> {
  return {
    entities: entityIds,
    store: trait.store,
    
    forEach(callback) {
      for (const eid of entityIds) {
        const record = getTypedTraitValues(trait, eid)
        callback(record, eid)
      }
    },
    
    updateEach(callback) {
      for (const eid of entityIds) {
        const record = getTypedTraitValues(trait, eid)
        const updates = callback(record, eid)
        if (updates) {
          setTypedTraitValues(trait, eid, updates)
        }
      }
    },
    
    map<R>(callback: (record: TypedTraitRecord<T>, entityId: number) => R): R[] {
      return entityIds.map(eid => {
        const record = getTypedTraitValues(trait, eid)
        return callback(record, eid)
      })
    },
  }
}

// ============================================================================
// Bulk Operations (High Performance Path)
// ============================================================================

/**
 * Provides direct store access for maximum performance bulk operations.
 * 
 * WARNING: This bypasses all safety checks. Ensure:
 * - Entity IDs are valid
 * - Values are within TypedArray bounds
 * - No concurrent modifications
 * 
 * @example
 * ```ts
 * const { x, y } = useTypedStore(world, Position)
 * for (const eid of entities) {
 *   x[eid] += vx[eid] * delta
 *   y[eid] += vy[eid] * delta
 * }
 * ```
 */
export function useTypedStore<T extends TypedTraitSchema>(
  world: object,
  trait: TypedTrait<T>
): TypedTraitStore<T> {
  // Ensure registered
  registerTypedTraitWithWorld(world, trait)
  return trait.store
}

/**
 * Provides store access for multiple traits at once
 */
export function useTypedStores<T extends TypedTrait<any>[]>(
  world: object,
  ...traits: T
): { [K in keyof T]: T[K] extends TypedTrait<infer S> ? TypedTraitStore<S> : never } {
  return traits.map(trait => {
    registerTypedTraitWithWorld(world, trait)
    return trait.store
  }) as any
}

// ============================================================================
// Change Tracking
// ============================================================================

/** Tracks which entities have been modified for a trait */
const traitDirtyMaps = new WeakMap<TypedTrait<any>, Set<number>>()

/**
 * Marks an entity as dirty for a trait (for change tracking)
 */
export function markTypedTraitDirty<T extends TypedTraitSchema>(
  trait: TypedTrait<T>,
  entityId: number
): void {
  let dirtySet = traitDirtyMaps.get(trait)
  if (!dirtySet) {
    dirtySet = new Set()
    traitDirtyMaps.set(trait, dirtySet)
  }
  dirtySet.add(entityId)
}

/**
 * Gets all dirty entities for a trait
 */
export function getTypedTraitDirtyEntities<T extends TypedTraitSchema>(
  trait: TypedTrait<T>
): Set<number> {
  return traitDirtyMaps.get(trait) ?? new Set()
}

/**
 * Clears dirty flags for a trait
 */
export function clearTypedTraitDirty<T extends TypedTraitSchema>(
  trait: TypedTrait<T>
): void {
  const dirtySet = traitDirtyMaps.get(trait)
  if (dirtySet) {
    dirtySet.clear()
  }
}

/**
 * Creates a proxy that automatically marks changes as dirty
 */
export function createDirtyTrackingProxy<T extends TypedTraitSchema>(
  trait: TypedTrait<T>,
  entityId: number
): TypedTraitRecord<T> {
  const { store, fieldNames } = trait
  
  return new Proxy({} as TypedTraitRecord<T>, {
    get(_, prop: string) {
      if (fieldNames.includes(prop as keyof T)) {
        return (store[prop as keyof T] as any)[entityId]
      }
      return undefined
    },
    
    set(_, prop: string, value) {
      if (fieldNames.includes(prop as keyof T)) {
        (store[prop as keyof T] as any)[entityId] = value
        markTypedTraitDirty(trait, entityId)
        return true
      }
      return false
    },
  })
}

// ============================================================================
// Serialization Support
// ============================================================================

/**
 * Serializes typed trait data for an entity
 */
export function serializeTypedTrait<T extends TypedTraitSchema>(
  trait: TypedTrait<T>,
  entityId: number
): { [K in keyof T]: number | bigint } {
  return getTypedTraitValues(trait, entityId)
}

/**
 * Deserializes typed trait data for an entity
 */
export function deserializeTypedTrait<T extends TypedTraitSchema>(
  trait: TypedTrait<T>,
  entityId: number,
  data: Partial<TypedTraitRecord<T>>
): void {
  setTypedTraitValues(trait, entityId, data)
}

/**
 * Serializes all entities' typed trait data
 */
export function serializeTypedTraitBulk<T extends TypedTraitSchema>(
  trait: TypedTrait<T>,
  entityIds: number[]
): ArrayBuffer {
  const { fieldNames, schema } = trait
  
  // Calculate total size
  let bytesPerEntity = 0
  for (const field of fieldNames) {
    bytesPerEntity += schema[field].BYTES_PER_ELEMENT
  }
  
  const buffer = new ArrayBuffer(entityIds.length * bytesPerEntity)
  const view = new DataView(buffer)
  
  let offset = 0
  for (const eid of entityIds) {
    for (const field of fieldNames) {
      const value = (trait.store[field] as any)[eid]
      const bytes = schema[field].BYTES_PER_ELEMENT
      
      // Write based on type
      switch (bytes) {
        case 1:
          view.setUint8(offset, value)
          break
        case 2:
          view.setUint16(offset, value, true)
          break
        case 4:
          view.setFloat32(offset, value, true)
          break
        case 8:
          view.setFloat64(offset, value, true)
          break
      }
      
      offset += bytes
    }
  }
  
  return buffer
}

// ============================================================================
// Defragmentation Support
// ============================================================================

/**
 * Compacts typed trait storage by moving active entities to contiguous indices.
 * This is useful after many entity deletions to improve cache utilization.
 * 
 * @param trait - The typed trait to compact
 * @param activeEntityIds - Set of currently active entity IDs
 * @param remapCallback - Called for each entity that is remapped to a new ID
 * @returns Map of old entity ID -> new entity ID
 */
export function compactTypedTrait<T extends TypedTraitSchema>(
  trait: TypedTrait<T>,
  activeEntityIds: Set<number>,
  remapCallback?: (oldId: number, newId: number) => void
): Map<number, number> {
  const remap = new Map<number, number>()
  const sorted = Array.from(activeEntityIds).sort((a, b) => a - b)
  
  let targetIndex = 0
  for (const sourceIndex of sorted) {
    if (sourceIndex !== targetIndex) {
      // Copy data from source to target
      for (const field of trait.fieldNames) {
        const array = trait.store[field] as any
        array[targetIndex] = array[sourceIndex]
      }
      
      remap.set(sourceIndex, targetIndex)
      remapCallback?.(sourceIndex, targetIndex)
    }
    targetIndex++
  }
  
  return remap
}
