/**
 * @file layout.test.ts
 * @description Tests for interleaved layouts and multi-trait storage
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  // Single-trait interleaved
  interleavedTrait,
  isInterleavedTrait,
  setInterleavedTraitValues,
  getInterleavedTraitValues,
  resetInterleavedTraitValues,
  INTERLEAVED_TRAIT_SYMBOL,

  // Multi-trait layout
  layout,
  isLayout,
  isLayoutTrait,
  getTraitLayout,
  LAYOUT_SYMBOL,

  // Types
  type InterleavedTrait,
  type Layout,
  type LayoutSchema,
  getBytesPerElement,
} from '../src/layout'

// ============================================================================
// Single-Trait Interleaved Tests
// ============================================================================

describe('interleavedTrait', () => {
  describe('creation', () => {
    it('should create an interleaved trait with correct structure', () => {
      const Position = interleavedTrait({
        x: Float32Array,
        y: Float32Array,
        z: Float32Array,
      })

      expect(Position[INTERLEAVED_TRAIT_SYMBOL]).toBe(true)
      expect(Position.schema).toEqual({
        x: Float32Array,
        y: Float32Array,
        z: Float32Array,
      })
      expect(Position.stride).toBe(12) // 3 × 4 bytes
      expect(Position.offsets).toEqual({ x: 0, y: 4, z: 8 })
    })

    it('should allocate buffer with correct size', () => {
      const Position = interleavedTrait({
        x: Float32Array,
        y: Float32Array,
      }, {
        capacity: 100,
      })

      // stride = 8 bytes, capacity = 100
      expect(Position.buffer.byteLength).toBe(8 * 100)
      expect(Position.capacity).toBe(100)
    })

    it('should support different TypedArray types', () => {
      const Mixed = interleavedTrait({
        position: Float32Array,
        flags: Uint8Array,
        index: Uint32Array,
      })

      expect(Mixed.stride).toBe(4 + 1 + 4) // 9 bytes
      expect(Mixed.offsets).toEqual({
        position: 0,
        flags: 4,
        index: 5,
      })
    })

    it('should be callable for initialization', () => {
      const Position = interleavedTrait({
        x: Float32Array,
        y: Float32Array,
      })

      const [trait, params] = Position({ x: 100, y: 200 })

      expect(trait).toBe(Position)
      expect(params).toEqual({ x: 100, y: 200 })
    })

    it('should throw for empty schema', () => {
      expect(() => interleavedTrait({})).toThrow()
    })
  })

  describe('isInterleavedTrait', () => {
    it('should return true for interleaved traits', () => {
      const Position = interleavedTrait({ x: Float32Array })
      expect(isInterleavedTrait(Position)).toBe(true)
    })

    it('should return false for non-interleaved values', () => {
      expect(isInterleavedTrait({})).toBe(false)
      expect(isInterleavedTrait(null)).toBe(false)
      expect(isInterleavedTrait(() => {})).toBe(false)
    })
  })

  describe('store access (strided)', () => {
    let Position: InterleavedTrait<{
      x: Float32ArrayConstructor
      y: Float32ArrayConstructor
      z: Float32ArrayConstructor
    }>

    beforeEach(() => {
      Position = interleavedTrait({
        x: Float32Array,
        y: Float32Array,
        z: Float32Array,
      }, {
        capacity: 10,
      })
    })

    it('should write values at correct byte offsets', () => {
      // Set values using store
      Position.store.x[0] = 1.0
      Position.store.y[0] = 2.0
      Position.store.z[0] = 3.0

      Position.store.x[1] = 4.0
      Position.store.y[1] = 5.0
      Position.store.z[1] = 6.0

      // Verify via raw buffer
      const view = new DataView(Position.buffer)

      // Entity 0: bytes 0-11
      expect(view.getFloat32(0, true)).toBe(1.0)  // x[0] at offset 0
      expect(view.getFloat32(4, true)).toBe(2.0)  // y[0] at offset 4
      expect(view.getFloat32(8, true)).toBe(3.0)  // z[0] at offset 8

      // Entity 1: bytes 12-23
      expect(view.getFloat32(12, true)).toBe(4.0) // x[1] at offset 12
      expect(view.getFloat32(16, true)).toBe(5.0) // y[1] at offset 16
      expect(view.getFloat32(20, true)).toBe(6.0) // z[1] at offset 20
    })

    it('should read values from correct byte offsets', () => {
      // Write directly to buffer
      const view = new DataView(Position.buffer)
      view.setFloat32(0, 10.0, true)   // x[0]
      view.setFloat32(4, 20.0, true)   // y[0]
      view.setFloat32(8, 30.0, true)   // z[0]
      view.setFloat32(12, 40.0, true)  // x[1]
      view.setFloat32(16, 50.0, true)  // y[1]
      view.setFloat32(20, 60.0, true)  // z[1]

      // Read via store
      expect(Position.store.x[0]).toBe(10.0)
      expect(Position.store.y[0]).toBe(20.0)
      expect(Position.store.z[0]).toBe(30.0)
      expect(Position.store.x[1]).toBe(40.0)
      expect(Position.store.y[1]).toBe(50.0)
      expect(Position.store.z[1]).toBe(60.0)
    })

    it('should support iteration', () => {
      Position.store.x[0] = 1
      Position.store.x[1] = 2
      Position.store.x[2] = 3

      let sum = 0
      Position.store.x.forEach((val, i) => {
        if (i < 3) sum += val
      })

      expect(sum).toBe(6)
    })

    it('should support fill', () => {
      Position.store.x.fill(42, 0, 5)

      for (let i = 0; i < 5; i++) {
        expect(Position.store.x[i]).toBe(42)
      }
    })
  })

  describe('value operations', () => {
    let Position: InterleavedTrait<{
      x: Float32ArrayConstructor
      y: Float32ArrayConstructor
    }>

    beforeEach(() => {
      Position = interleavedTrait({
        x: Float32Array,
        y: Float32Array,
      }, {
        capacity: 100,
        defaults: { x: 0, y: 0 },
      })
    })

    it('should set values for an entity', () => {
      setInterleavedTraitValues(Position, 5, { x: 100, y: 200 })

      expect(Position.store.x[5]).toBe(100)
      expect(Position.store.y[5]).toBe(200)
    })

    it('should get values for an entity', () => {
      Position.store.x[10] = 50
      Position.store.y[10] = 75

      const values = getInterleavedTraitValues(Position, 10)

      expect(values).toEqual({ x: 50, y: 75 })
    })

    it('should reset values to defaults', () => {
      setInterleavedTraitValues(Position, 7, { x: 999, y: 888 })
      resetInterleavedTraitValues(Position, 7)

      expect(Position.store.x[7]).toBe(0)
      expect(Position.store.y[7]).toBe(0)
    })
  })

  describe('growth', () => {
    it('should grow when capacity exceeded', () => {
      const Position = interleavedTrait({
        x: Float32Array,
      }, {
        capacity: 10,
        growthFactor: 2,
      })

      // Set value beyond capacity
      setInterleavedTraitValues(Position, 15, { x: 100 })

      expect(Position.capacity).toBeGreaterThanOrEqual(16)
      expect(Position.store.x[15]).toBe(100)
    })

    it('should preserve existing values when growing', () => {
      const Position = interleavedTrait({
        x: Float32Array,
        y: Float32Array,
      }, {
        capacity: 10,
      })

      setInterleavedTraitValues(Position, 5, { x: 500, y: 600 })

      // Force growth
      setInterleavedTraitValues(Position, 20, { x: 1, y: 1 })

      // Original values should be preserved
      expect(Position.store.x[5]).toBe(500)
      expect(Position.store.y[5]).toBe(600)
    })

    it('should throw when max capacity exceeded', () => {
      const Position = interleavedTrait({
        x: Float32Array,
      }, {
        capacity: 10,
        maxCapacity: 20,
      })

      expect(() => {
        setInterleavedTraitValues(Position, 25, { x: 100 })
      }).toThrow(/capacity exceeded/i)
    })
  })
})

// ============================================================================
// Multi-Trait Layout Tests
// ============================================================================

describe('layout', () => {
  describe('creation', () => {
    it('should create a layout with correct structure', () => {
      const InstanceData = layout({
        position: { x: Float32Array, y: Float32Array, z: Float32Array },
        rotation: Float32Array,
        scale: { x: Float32Array, y: Float32Array },
      }, {
        capacity: 1000,
      })

      expect(InstanceData[LAYOUT_SYMBOL]).toBe(true)
      expect(InstanceData.capacity).toBe(1000)
      expect(InstanceData.count).toBe(0)

      // Stride: 3*4 (position) + 4 (rotation) + 2*4 (scale) = 24 bytes
      expect(InstanceData.stride).toBe(24)
    })

    it('should calculate correct offsets for field groups', () => {
      const InstanceData = layout({
        position: { x: Float32Array, y: Float32Array, z: Float32Array },
        rotation: Float32Array,
      }, {
        capacity: 100,
      })

      // position starts at 0, size 12
      // rotation starts at 12, size 4
      expect(InstanceData.metadata.traitOffsets.position).toBe(0)
      expect(InstanceData.metadata.traitOffsets.rotation).toBe(12)
    })

    it('should extract traits from schema', () => {
      const InstanceData = layout({
        position: { x: Float32Array, y: Float32Array, z: Float32Array },
        rotation: Float32Array,
      }, {
        capacity: 100,
      })

      const { position, rotation } = InstanceData.traits

      expect(typeof position).toBe('function')
      expect(typeof rotation).toBe('function')
      expect(position._traitName).toBe('position')
      expect(rotation._traitName).toBe('rotation')
    })

    it('should be callable as traits', () => {
      const InstanceData = layout({
        position: { x: Float32Array, y: Float32Array },
      }, {
        capacity: 100,
      })

      const { position } = InstanceData.traits
      const [trait, params] = position({ x: 100, y: 200 })

      expect(trait).toBe(position)
      expect(params).toEqual({ x: 100, y: 200 })
    })

    it('should support mixed TypedArray types', () => {
      const InstanceData = layout({
        position: { x: Float32Array, y: Float32Array },
        color: { r: Uint8Array, g: Uint8Array, b: Uint8Array, a: Uint8Array },
        index: Uint32Array,
      }, {
        capacity: 100,
      })

      // position: 8 bytes, color: 4 bytes, index: 4 bytes = 16 bytes
      expect(InstanceData.stride).toBe(16)
    })

    it('should apply alignment', () => {
      const InstanceData = layout({
        flag: Uint8Array,  // 1 byte
      }, {
        capacity: 100,
        alignment: 4,
      })

      // 1 byte padded to 4 byte alignment
      expect(InstanceData.stride).toBe(4)
    })
  })

  describe('isLayout', () => {
    it('should return true for layouts', () => {
      const InstanceData = layout({
        position: { x: Float32Array },
      }, { capacity: 100 })

      expect(isLayout(InstanceData)).toBe(true)
    })

    it('should return false for non-layouts', () => {
      expect(isLayout({})).toBe(false)
      expect(isLayout(null)).toBe(false)
    })
  })

  describe('isLayoutTrait', () => {
    it('should identify layout-backed traits', () => {
      const InstanceData = layout({
        position: { x: Float32Array },
      }, { capacity: 100 })

      expect(isLayoutTrait(InstanceData.traits.position)).toBe(true)
    })

    it('should return false for regular traits', () => {
      expect(isLayoutTrait(() => {})).toBe(false)
    })
  })

  describe('getTraitLayout', () => {
    it('should return the parent layout', () => {
      const InstanceData = layout({
        position: { x: Float32Array },
      }, { capacity: 100 })

      const parentLayout = getTraitLayout(InstanceData.traits.position)
      expect(parentLayout).toBe(InstanceData)
    })
  })

  describe('entity management (dense packing)', () => {
    let InstanceData: Layout<{
      position: { x: Float32ArrayConstructor; y: Float32ArrayConstructor }
      rotation: Float32ArrayConstructor
    }>

    beforeEach(() => {
      InstanceData = layout({
        position: { x: Float32Array, y: Float32Array },
        rotation: Float32Array,
      }, {
        capacity: 100,
        growth: 'fixed',
      })
    })

    it('should add entities with dense packing', () => {
      const idx0 = InstanceData._addEntity(100)  // Entity ID 100
      const idx1 = InstanceData._addEntity(200)  // Entity ID 200
      const idx2 = InstanceData._addEntity(300)  // Entity ID 300

      expect(idx0).toBe(0)
      expect(idx1).toBe(1)
      expect(idx2).toBe(2)
      expect(InstanceData.count).toBe(3)
    })

    it('should track entity ID to buffer index mapping', () => {
      InstanceData._addEntity(100)
      InstanceData._addEntity(200)
      InstanceData._addEntity(300)

      expect(InstanceData.indexOf(100)).toBe(0)
      expect(InstanceData.indexOf(200)).toBe(1)
      expect(InstanceData.indexOf(300)).toBe(2)
      expect(InstanceData.indexOf(999)).toBe(-1)
    })

    it('should track buffer index to entity ID mapping', () => {
      InstanceData._addEntity(100)
      InstanceData._addEntity(200)
      InstanceData._addEntity(300)

      expect(InstanceData.entityAt(0)).toBe(100)
      expect(InstanceData.entityAt(1)).toBe(200)
      expect(InstanceData.entityAt(2)).toBe(300)
    })

    it('should return existing index for duplicate add', () => {
      const idx0 = InstanceData._addEntity(100)
      const idx1 = InstanceData._addEntity(100)  // Same entity

      expect(idx0).toBe(0)
      expect(idx1).toBe(0)
      expect(InstanceData.count).toBe(1)
    })

    it('should remove entities with swap-remove', () => {
      InstanceData._addEntity(100)
      InstanceData._addEntity(200)
      InstanceData._addEntity(300)

      // Set some values
      InstanceData._setValues(100, 'position', { x: 1, y: 1 })
      InstanceData._setValues(200, 'position', { x: 2, y: 2 })
      InstanceData._setValues(300, 'position', { x: 3, y: 3 })

      // Remove middle entity (200)
      InstanceData._removeEntity(200)

      // Count should decrease
      expect(InstanceData.count).toBe(2)

      // Entity 300 should have moved to index 1
      expect(InstanceData.indexOf(300)).toBe(1)
      expect(InstanceData.indexOf(200)).toBe(-1)

      // Data should have been swapped
      const values = InstanceData._getValues(300, 'position')
      expect(values).toEqual({ x: 3, y: 3 })
    })

    it('should throw when capacity exceeded with fixed growth', () => {
      const SmallLayout = layout({
        position: { x: Float32Array },
      }, {
        capacity: 2,
        growth: 'fixed',
      })

      SmallLayout._addEntity(1)
      SmallLayout._addEntity(2)

      expect(() => SmallLayout._addEntity(3)).toThrow(/capacity exceeded/i)
    })

    it('should check has() correctly', () => {
      InstanceData._addEntity(100)

      expect(InstanceData.has(100)).toBe(true)
      expect(InstanceData.has(999)).toBe(false)
    })
  })

  describe('store access', () => {
    it('should write values to correct buffer positions', () => {
      const InstanceData = layout({
        position: { x: Float32Array, y: Float32Array },
        rotation: Float32Array,
      }, {
        capacity: 10,
      })

      InstanceData._addEntity(100)
      InstanceData._addEntity(200)

      // Write via store
      InstanceData.store.position.x[0] = 10
      InstanceData.store.position.y[0] = 20
      InstanceData.store.rotation[0] = 0.5

      InstanceData.store.position.x[1] = 30
      InstanceData.store.position.y[1] = 40
      InstanceData.store.rotation[1] = 1.5

      // Verify via raw buffer
      const view = new DataView(InstanceData.buffer)
      const stride = InstanceData.stride

      // Entity 0 (index 0): position at 0, rotation at 8
      expect(view.getFloat32(0, true)).toBe(10)   // position.x[0]
      expect(view.getFloat32(4, true)).toBe(20)   // position.y[0]
      expect(view.getFloat32(8, true)).toBe(0.5)  // rotation[0]

      // Entity 1 (index 1): position at stride, rotation at stride+8
      expect(view.getFloat32(stride + 0, true)).toBe(30)  // position.x[1]
      expect(view.getFloat32(stride + 4, true)).toBe(40)  // position.y[1]
      expect(view.getFloat32(stride + 8, true)).toBe(1.5) // rotation[1]
    })

    it('should read values from correct buffer positions', () => {
      const InstanceData = layout({
        position: { x: Float32Array, y: Float32Array },
        rotation: Float32Array,
      }, {
        capacity: 10,
      })

      InstanceData._addEntity(100)

      // Write directly to buffer
      const view = new DataView(InstanceData.buffer)
      view.setFloat32(0, 100, true)   // position.x[0]
      view.setFloat32(4, 200, true)   // position.y[0]
      view.setFloat32(8, 3.14, true)  // rotation[0]

      // Read via store
      expect(InstanceData.store.position.x[0]).toBe(100)
      expect(InstanceData.store.position.y[0]).toBe(200)
      expect(InstanceData.store.rotation[0]).toBeCloseTo(3.14)
    })
  })

  describe('_setValues and _getValues', () => {
    it('should set and get field group values', () => {
      const InstanceData = layout({
        position: { x: Float32Array, y: Float32Array, z: Float32Array },
      }, {
        capacity: 10,
      })

      InstanceData._addEntity(100)
      InstanceData._setValues(100, 'position', { x: 1, y: 2, z: 3 })

      const values = InstanceData._getValues(100, 'position')
      expect(values).toEqual({ x: 1, y: 2, z: 3 })
    })

    it('should set and get single field values', () => {
      const InstanceData = layout({
        rotation: Float32Array,
      }, {
        capacity: 10,
      })

      InstanceData._addEntity(100)
      InstanceData._setValues(100, 'rotation', Math.PI as any)

      const value = InstanceData._getValues(100, 'rotation')
      expect(value).toBeCloseTo(Math.PI)
    })

    it('should throw for non-existent entity', () => {
      const InstanceData = layout({
        position: { x: Float32Array },
      }, {
        capacity: 10,
      })

      expect(() => {
        InstanceData._setValues(999, 'position', { x: 1 })
      }).toThrow(/not in layout/i)
    })
  })

  describe('BYOB (Bring Your Own Buffer)', () => {
    it('should use external buffer', () => {
      const externalBuffer = new ArrayBuffer(1000)

      const InstanceData = layout({
        position: { x: Float32Array, y: Float32Array },
      }, {
        capacity: 100,
        buffer: externalBuffer,
        growth: 'none',
      })

      expect(InstanceData.buffer).toBe(externalBuffer)
    })

    it('should throw if external buffer is too small', () => {
      const smallBuffer = new ArrayBuffer(10)

      expect(() => {
        layout({
          position: { x: Float32Array, y: Float32Array },
        }, {
          capacity: 100,  // Needs 800 bytes
          buffer: smallBuffer,
        })
      }).toThrow(/too small/i)
    })

    it('should write to external buffer', () => {
      const externalBuffer = new ArrayBuffer(1000)

      const InstanceData = layout({
        value: Float32Array,
      }, {
        capacity: 100,
        buffer: externalBuffer,
      })

      InstanceData._addEntity(1)
      InstanceData.store.value[0] = 42

      // Verify data is in external buffer
      const view = new DataView(externalBuffer)
      expect(view.getFloat32(0, true)).toBe(42)
    })
  })
})

// ============================================================================
// Integration Tests
// ============================================================================

describe('integration', () => {
  describe('GPU upload pattern', () => {
    it('should provide contiguous buffer for upload', () => {
      const InstanceData = layout({
        position: { x: Float32Array, y: Float32Array, z: Float32Array },
        rotation: Float32Array,
        scale: { x: Float32Array, y: Float32Array },
      }, {
        capacity: 1000,
        growth: 'fixed',
      })

      // Simulate spawning entities
      for (let i = 0; i < 100; i++) {
        const idx = InstanceData._addEntity(i)
        InstanceData.store.position.x[idx] = i * 10
        InstanceData.store.position.y[idx] = i * 20
        InstanceData.store.position.z[idx] = 0
        InstanceData.store.rotation[idx] = i * 0.1
        InstanceData.store.scale.x[idx] = 1
        InstanceData.store.scale.y[idx] = 1
      }

      // Buffer is ready for GPU upload
      const uploadSize = InstanceData.count * InstanceData.stride
      expect(uploadSize).toBe(100 * 24) // 100 entities × 24 bytes

      // The buffer is contiguous - no gaps
      const view = new DataView(InstanceData.buffer)
      for (let i = 0; i < 10; i++) {
        const offset = i * InstanceData.stride
        expect(view.getFloat32(offset, true)).toBe(i * 10) // position.x
      }
    })
  })

  describe('swap-remove maintains buffer validity', () => {
    it('should keep buffer contiguous after removals', () => {
      const InstanceData = layout({
        id: Uint32Array,
        position: { x: Float32Array, y: Float32Array },
      }, {
        capacity: 10,
      })

      // Add 5 entities
      for (let i = 0; i < 5; i++) {
        const idx = InstanceData._addEntity(i)
        InstanceData.store.id[idx] = i
        InstanceData.store.position.x[idx] = i * 100
        InstanceData.store.position.y[idx] = i * 100
      }

      expect(InstanceData.count).toBe(5)

      // Remove entities 1 and 3
      InstanceData._removeEntity(1)
      InstanceData._removeEntity(3)

      expect(InstanceData.count).toBe(3)

      // Buffer should still be contiguous (first 3 slots used)
      // Entities remaining: 0, 2, and either 4 (swapped in)
      // The exact order depends on swap-remove

      // Verify all active entities have valid data
      const activeIds = new Set<number>()
      for (let i = 0; i < InstanceData.count; i++) {
        const id = InstanceData.store.id[i]
        activeIds.add(id)
        // Position should match ID * 100
        expect(InstanceData.store.position.x[i]).toBe(id * 100)
      }

      expect(activeIds.has(0)).toBe(true)
      expect(activeIds.has(1)).toBe(false) // Removed
      expect(activeIds.has(2)).toBe(true)
      expect(activeIds.has(3)).toBe(false) // Removed
      expect(activeIds.has(4)).toBe(true)
    })
  })

  describe('mixed type layout', () => {
    it('should handle mixed Float32 and Uint8 correctly', () => {
      const SpriteData = layout({
        position: { x: Float32Array, y: Float32Array },
        color: { r: Uint8Array, g: Uint8Array, b: Uint8Array, a: Uint8Array },
      }, {
        capacity: 10,
      })

      // Stride: 8 (position) + 4 (color) = 12 bytes
      expect(SpriteData.stride).toBe(12)

      SpriteData._addEntity(1)
      SpriteData._setValues(1, 'position', { x: 100.5, y: 200.5 })
      SpriteData._setValues(1, 'color', { r: 255, g: 128, b: 64, a: 255 })

      const pos = SpriteData._getValues(1, 'position')
      const color = SpriteData._getValues(1, 'color')

      expect(pos.x).toBeCloseTo(100.5)
      expect(pos.y).toBeCloseTo(200.5)
      expect(color).toEqual({ r: 255, g: 128, b: 64, a: 255 })
    })
  })
})

// ============================================================================
// Type Safety Tests (compile-time)
// ============================================================================

describe('type safety', () => {
  it('should infer correct record types from schema', () => {
    const InstanceData = layout({
      position: { x: Float32Array, y: Float32Array, z: Float32Array },
      rotation: Float32Array,
    }, {
      capacity: 10,
    })

    InstanceData._addEntity(1)

    // These should type-check correctly
    const pos = InstanceData._getValues(1, 'position')
    const rot = InstanceData._getValues(1, 'rotation')

    // TypeScript knows pos has x, y, z
    const x: number = pos.x
    const y: number = pos.y
    const z: number = pos.z

    // TypeScript knows rot is a number
    const r: number = rot as number

    expect(typeof x).toBe('number')
    expect(typeof y).toBe('number')
    expect(typeof z).toBe('number')
    expect(typeof r).toBe('number')
  })

  it('should infer correct store types', () => {
    const InstanceData = layout({
      position: { x: Float32Array, y: Float32Array },
      flags: Uint8Array,
    }, {
      capacity: 10,
    })

    // TypeScript knows store.position.x is indexable
    InstanceData.store.position.x[0] = 1

    // TypeScript knows store.flags is indexable
    InstanceData.store.flags[0] = 1

    expect(InstanceData.store.position.x[0]).toBe(1)
    expect(InstanceData.store.flags[0]).toBe(1)
  })
})

// ============================================================================
// Performance Characteristics
// ============================================================================

describe('performance', () => {
  it('should handle bulk iteration efficiently', () => {
    const InstanceData = layout({
      position: { x: Float32Array, y: Float32Array },
      velocity: { x: Float32Array, y: Float32Array },
    }, {
      capacity: 10000,
    })

    // Add 10000 entities
    for (let i = 0; i < 10000; i++) {
      const idx = InstanceData._addEntity(i)
      InstanceData.store.position.x[idx] = i
      InstanceData.store.position.y[idx] = i * 2
      InstanceData.store.velocity.x[idx] = 1
      InstanceData.store.velocity.y[idx] = 2
    }

    // Time bulk update
    const start = performance.now()

    const px = InstanceData.store.position.x
    const py = InstanceData.store.position.y
    const vx = InstanceData.store.velocity.x
    const vy = InstanceData.store.velocity.y
    const count = InstanceData.count

    for (let i = 0; i < count; i++) {
      px[i] = px[i] + vx[i]
      py[i] = py[i] + vy[i]
    }

    const elapsed = performance.now() - start

    // Should be fast (sub-millisecond for 10k entities)
    expect(elapsed).toBeLessThan(10)

    // Verify results
    expect(InstanceData.store.position.x[0]).toBe(1)
    expect(InstanceData.store.position.y[0]).toBe(2)
  })
})
