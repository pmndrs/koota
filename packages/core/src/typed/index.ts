/**
 * @file typed/index.ts
 * @description TypedArray-backed traits extension for Koota
 * 
 * This should be placed in packages/core/src/typed/index.ts
 * and exported from the main index as: export * from './typed'
 * 
 * Usage:
 * ```ts
 * import { trait } from 'koota'
 * import { typedTrait, useTypedStore } from 'koota/typed'
 * // or after attaching:
 * import { trait } from 'koota'
 * trait.typed({ x: Float32Array, y: Float32Array })
 * ```
 */

// Re-export everything from typed trait
export {
  // Core types
  type TypedArrayConstructor,
  type TypedTraitSchema,
  type TypedTraitDefaults,
  type TypedTraitRecord,
  type TypedTraitStore,
  type TypedTraitOptions,
  type TypedTrait,
  type TypedTraitInitializer,
  type TypedTraitMetadata,
  
  // Core functions
  typedTrait,
  isTypedTrait,
  growTypedTraitStore,
  setTypedTraitValues,
  getTypedTraitValues,
  resetTypedTraitValues,
  copyTypedTraitValues,
  swapTypedTraitValues,
  
  // Buffer operations
  type InterleavedBufferLayout,
  getInterleavedLayout,
  packToInterleavedBuffer,
  packFieldsToInterleavedBuffer,
  
  // Symbol
  TYPED_TRAIT_SYMBOL,
} from './typed-trait'

// Re-export integration layer
export {
  // World operations
  registerTypedTraitWithWorld,
  getTypedTraitStoreForWorld,
  
  // Entity operations
  addTypedTraitToEntity,
  removeTypedTraitFromEntity,
  setEntityTypedTrait,
  getEntityTypedTrait,
  
  // Query support
  type TypedQueryResult,
  createTypedQueryResult,
  
  // Bulk operations
  useTypedStore,
  useTypedStores,
  
  // Change tracking
  markTypedTraitDirty,
  getTypedTraitDirtyEntities,
  clearTypedTraitDirty,
  createDirtyTrackingProxy,
  
  // Serialization
  serializeTypedTrait,
  deserializeTypedTrait,
  serializeTypedTraitBulk,
  
  // Defragmentation
  compactTypedTrait,
} from './typed-trait-integration'

// ============================================================================
// Convenience factories for common patterns
// ============================================================================

import { typedTrait } from './typed-trait'
import type { TypedTraitSchema, TypedTraitOptions, TypedTrait } from './typed-trait'

/**
 * Creates a Vec2 typed trait
 */
export function vec2Trait(
  options?: Omit<TypedTraitOptions<{ x: Float32ArrayConstructor; y: Float32ArrayConstructor }>, 'defaults'>
): TypedTrait<{ x: Float32ArrayConstructor; y: Float32ArrayConstructor }> {
  return typedTrait({
    x: Float32Array,
    y: Float32Array,
  }, {
    ...options,
    defaults: { x: 0, y: 0 },
  })
}

/**
 * Creates a Vec3 typed trait
 */
export function vec3Trait(
  options?: Omit<TypedTraitOptions<{ x: Float32ArrayConstructor; y: Float32ArrayConstructor; z: Float32ArrayConstructor }>, 'defaults'>
): TypedTrait<{ x: Float32ArrayConstructor; y: Float32ArrayConstructor; z: Float32ArrayConstructor }> {
  return typedTrait({
    x: Float32Array,
    y: Float32Array,
    z: Float32Array,
  }, {
    ...options,
    defaults: { x: 0, y: 0, z: 0 },
  })
}

/**
 * Creates a Vec4 / Color typed trait
 */
export function vec4Trait(
  options?: Omit<TypedTraitOptions<{ x: Float32ArrayConstructor; y: Float32ArrayConstructor; z: Float32ArrayConstructor; w: Float32ArrayConstructor }>, 'defaults'>
): TypedTrait<{ x: Float32ArrayConstructor; y: Float32ArrayConstructor; z: Float32ArrayConstructor; w: Float32ArrayConstructor }> {
  return typedTrait({
    x: Float32Array,
    y: Float32Array,
    z: Float32Array,
    w: Float32Array,
  }, {
    ...options,
    defaults: { x: 0, y: 0, z: 0, w: 1 },
  })
}

/**
 * Creates a transform typed trait (position + rotation + scale)
 */
export function transform2DTrait(
  options?: TypedTraitOptions<any>
): TypedTrait<{
  x: Float32ArrayConstructor
  y: Float32ArrayConstructor
  z: Float32ArrayConstructor
  rotation: Float32ArrayConstructor
  scaleX: Float32ArrayConstructor
  scaleY: Float32ArrayConstructor
}> {
  return typedTrait({
    x: Float32Array,
    y: Float32Array,
    z: Float32Array,
    rotation: Float32Array,
    scaleX: Float32Array,
    scaleY: Float32Array,
  }, {
    ...options,
    defaults: { x: 0, y: 0, z: 0, rotation: 0, scaleX: 1, scaleY: 1 },
  })
}
