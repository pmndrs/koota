/**
 * @file layout/index.ts
 * @description Multi-paradigm TypedArray storage with interleaved layouts
 *
 * This module provides GPU-friendly interleaved storage paradigms:
 *
 * 1. Single-trait Interleaved - via interleavedTrait()
 *    Single trait, fields interleaved: [x0,y0,z0, x1,y1,z1, ...]
 *
 * 2. Multi-trait Layout - via layout()
 *    Multiple traits in one buffer: [pos,rot,scale, pos,rot,scale, ...]
 *
 * For SoA (Structure of Arrays) storage, use typedTrait() from './typed'.
 *
 * @example
 * ```ts
 * import { layout, interleavedTrait } from 'koota'
 *
 * // Single-trait interleaved
 * const Position = interleavedTrait({
 *   x: Float32Array,
 *   y: Float32Array,
 *   z: Float32Array,
 * })
 *
 * // Multi-trait layout
 * const InstanceData = layout({
 *   position: { x: Float32Array, y: Float32Array, z: Float32Array },
 *   rotation: Float32Array,
 *   scale: { x: Float32Array, y: Float32Array },
 * }, {
 *   capacity: 10_000,
 *   growth: 'fixed',
 * })
 *
 * // Direct store access (working now)
 * InstanceData.store.position.x[0] = 100
 *
 * // Direct buffer upload to GPU (working now)
 * device.queue.writeBuffer(gpuBuffer, 0, InstanceData.buffer)
 *
 * // NOTE: Koota world integration (spawn, query) is not yet implemented
 * ```
 */

// Core types
export {
  // TypedArray types
  type TypedArrayConstructor,
  type TypedArrayInstance,
  type ElementType,

  // Schema types
  type FieldGroup,
  type SingleField,
  type SchemaEntry,
  type LayoutSchema,
  type IsFieldGroup,

  // Record types
  type FieldGroupRecord,
  type SchemaEntryRecord,
  type LayoutRecords,

  // Store types
  type FieldGroupStore,
  type SingleFieldStore,
  type SchemaEntryStore,
  type LayoutStore,

  // Options and policies
  type GrowthPolicy,
  type LayoutOptions,

  // Metadata
  type FieldOffset,
  type TraitLayoutInfo,
  type LayoutMetadata,

  // Entity mapping
  type EntityMapping,

  // Layout instance
  type Layout,
  LAYOUT_SYMBOL,

  // Layout trait types
  type LayoutBackedTrait,
  type LayoutTraits,
  type LayoutTrait,

  // Interleaved trait types
  type InterleavedTrait,
  type InterleavedTraitOptions,
  INTERLEAVED_TRAIT_SYMBOL,

  // Utilities
  getBytesPerElement,
  isTypedArrayConstructor,
  isFieldGroup,
} from './types'

// Single-trait interleaved
export {
  interleavedTrait,
  isInterleavedTrait,
  setInterleavedTraitValues,
  getInterleavedTraitValues,
  resetInterleavedTraitValues,
} from './interleaved-trait'

// Multi-trait layout
export {
  layout,
  isLayout,
  isLayoutTrait,
  getTraitLayout,
} from './layout'
