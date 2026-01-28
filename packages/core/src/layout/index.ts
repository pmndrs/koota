/**
 * @file layout/index.ts
 * @description Multi-trait interleaved layouts for GPU-friendly storage
 *
 * This module provides multi-trait layout functionality:
 *
 * Multi-trait Layout - via layout()
 *   Multiple traits in one buffer: [pos,rot,scale, pos,rot,scale, ...]
 *
 * For single-trait typed storage, use the unified trait() API with types helpers:
 *
 * @example
 * ```ts
 * import { trait, types, layout } from 'koota'
 *
 * // Single-trait SoA with TypedArrays
 * const Velocity = trait({ x: types.f32(0), y: types.f32(0) })
 *
 * // Single-trait AoS with interleaved buffer
 * const Position = trait(() => ({
 *   x: types.f32(0),
 *   y: types.f32(0),
 *   z: types.f32(0),
 * }), { alignment: 16 })
 *
 * // Multi-trait layout (experimental)
 * const InstanceData = layout({
 *   position: { x: Float32Array, y: Float32Array, z: Float32Array },
 *   rotation: Float32Array,
 *   scale: { x: Float32Array, y: Float32Array },
 * }, {
 *   capacity: 10_000,
 *   growth: 'fixed',
 * })
 *
 * // Direct store access
 * InstanceData.store.position.x[0] = 100
 *
 * // Direct buffer upload to GPU
 * device.queue.writeBuffer(gpuBuffer, 0, InstanceData.buffer)
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

  // Utilities
  getBytesPerElement,
  isTypedArrayConstructor,
  isFieldGroup,
} from './types'

// Multi-trait layout
export {
  layout,
  isLayout,
  isLayoutTrait,
  getTraitLayout,
} from './layout'
