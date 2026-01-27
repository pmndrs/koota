/**
 * @file typed-trait.test.ts
 * @description Tests for TypedTrait implementation
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  typedTrait,
  isTypedTrait,
  setTypedTraitValues,
  getTypedTraitValues,
  resetTypedTraitValues,
  growTypedTraitStore,
  copyTypedTraitValues,
  swapTypedTraitValues,
  packToInterleavedBuffer,
  packFieldsToInterleavedBuffer,
  getInterleavedLayout,
  TYPED_TRAIT_SYMBOL,
} from '../src'

import {
  registerTypedTraitWithWorld,
  addTypedTraitToEntity,
  markTypedTraitDirty,
  getTypedTraitDirtyEntities,
  clearTypedTraitDirty,
  createDirtyTrackingProxy,
  useTypedStore,
  compactTypedTrait,
} from '../src'

describe('typedTrait', () => {
  describe('creation', () => {
    it('should create a typed trait with correct structure', () => {
      const Position = typedTrait({
        x: Float32Array,
        y: Float32Array,
      })

      expect(Position[TYPED_TRAIT_SYMBOL]).toBe(true)
      expect(Position.schema).toEqual({
        x: Float32Array,
        y: Float32Array,
      })
      expect(Position.fieldNames).toEqual(['x', 'y'])
      expect(Position.store.x).toBeInstanceOf(Float32Array)
      expect(Position.store.y).toBeInstanceOf(Float32Array)
    })

    it('should apply default values', () => {
      const Position = typedTrait({
        x: Float32Array,
        y: Float32Array,
      }, {
        defaults: { x: 100, y: 200 },
        initialCapacity: 10,
      })

      // All values should be defaults
      for (let i = 0; i < 10; i++) {
        expect(Position.store.x[i]).toBe(100)
        expect(Position.store.y[i]).toBe(200)
      }
    })

    it('should respect initial capacity', () => {
      const Position = typedTrait({
        x: Float32Array,
      }, {
        initialCapacity: 500,
      })

      expect(Position.store.x.length).toBe(500)
      expect(Position.capacity).toBe(500)
    })

    it('should support different TypedArray types', () => {
      const Mixed = typedTrait({
        floatVal: Float32Array,
        intVal: Int32Array,
        uintVal: Uint16Array,
        byteVal: Uint8Array,
      })

      expect(Mixed.store.floatVal).toBeInstanceOf(Float32Array)
      expect(Mixed.store.intVal).toBeInstanceOf(Int32Array)
      expect(Mixed.store.uintVal).toBeInstanceOf(Uint16Array)
      expect(Mixed.store.byteVal).toBeInstanceOf(Uint8Array)
    })

    it('should be callable as a function for initialization', () => {
      const Position = typedTrait({
        x: Float32Array,
        y: Float32Array,
      })

      const initializer = Position({ x: 50, y: 75 })
      
      expect(initializer.trait).toBe(Position)
      expect(initializer.initial).toEqual({ x: 50, y: 75 })
    })
  })

  describe('isTypedTrait', () => {
    it('should return true for typed traits', () => {
      const Position = typedTrait({ x: Float32Array })
      expect(isTypedTrait(Position)).toBe(true)
    })

    it('should return false for non-typed traits', () => {
      expect(isTypedTrait({})).toBe(false)
      expect(isTypedTrait(null)).toBe(false)
      expect(isTypedTrait(() => {})).toBe(false)
    })
  })

  describe('value operations', () => {
    let Position: ReturnType<typeof typedTrait<{ x: Float32ArrayConstructor; y: Float32ArrayConstructor }>>

    beforeEach(() => {
      Position = typedTrait({
        x: Float32Array,
        y: Float32Array,
      }, {
        initialCapacity: 100,
        defaults: { x: 0, y: 0 },
      })
    })

    it('should set values for an entity', () => {
      setTypedTraitValues(Position, 5, { x: 10, y: 20 })

      expect(Position.store.x[5]).toBe(10)
      expect(Position.store.y[5]).toBe(20)
    })

    it('should get values for an entity', () => {
      Position.store.x[10] = 100
      Position.store.y[10] = 200

      const values = getTypedTraitValues(Position, 10)

      expect(values).toEqual({ x: 100, y: 200 })
    })

    it('should reset values to defaults', () => {
      setTypedTraitValues(Position, 7, { x: 999, y: 888 })
      resetTypedTraitValues(Position, 7)

      expect(Position.store.x[7]).toBe(0)
      expect(Position.store.y[7]).toBe(0)
    })

    it('should copy values between entities', () => {
      setTypedTraitValues(Position, 1, { x: 50, y: 60 })
      copyTypedTraitValues(Position, 1, 2)

      expect(Position.store.x[2]).toBe(50)
      expect(Position.store.y[2]).toBe(60)
    })

    it('should swap values between entities', () => {
      setTypedTraitValues(Position, 1, { x: 10, y: 20 })
      setTypedTraitValues(Position, 2, { x: 30, y: 40 })

      swapTypedTraitValues(Position, 1, 2)

      expect(getTypedTraitValues(Position, 1)).toEqual({ x: 30, y: 40 })
      expect(getTypedTraitValues(Position, 2)).toEqual({ x: 10, y: 20 })
    })
  })

  describe('growth', () => {
    it('should grow store when capacity exceeded', () => {
      const Position = typedTrait({
        x: Float32Array,
      }, {
        initialCapacity: 10,
        growthFactor: 2,
      })

      // Set value beyond capacity
      setTypedTraitValues(Position, 15, { x: 100 })

      expect(Position.capacity).toBeGreaterThanOrEqual(16)
      expect(Position.store.x[15]).toBe(100)
    })

    it('should preserve existing values when growing', () => {
      const Position = typedTrait({
        x: Float32Array,
      }, {
        initialCapacity: 10,
      })

      setTypedTraitValues(Position, 5, { x: 500 })
      growTypedTraitStore(Position, 100)

      expect(Position.store.x[5]).toBe(500)
    })

    it('should throw when max capacity exceeded', () => {
      const Position = typedTrait({
        x: Float32Array,
      }, {
        initialCapacity: 10,
        maxCapacity: 20,
      })

      expect(() => {
        setTypedTraitValues(Position, 25, { x: 100 })
      }).toThrow(/capacity exceeded/i)
    })
  })

  describe('interleaved buffer packing', () => {
    it('should pack to interleaved buffer', () => {
      const Position = typedTrait({
        x: Float32Array,
        y: Float32Array,
        z: Float32Array,
      }, { initialCapacity: 10 })

      setTypedTraitValues(Position, 0, { x: 1, y: 2, z: 3 })
      setTypedTraitValues(Position, 1, { x: 4, y: 5, z: 6 })

      const buffer = packToInterleavedBuffer(Position, [0, 1])

      // Should be interleaved: x0, y0, z0, x1, y1, z1
      expect(buffer).toEqual(new Float32Array([1, 2, 3, 4, 5, 6]))
    })

    it('should pack subset of fields', () => {
      const Position = typedTrait({
        x: Float32Array,
        y: Float32Array,
        z: Float32Array,
      }, { initialCapacity: 10 })

      setTypedTraitValues(Position, 0, { x: 1, y: 2, z: 3 })
      setTypedTraitValues(Position, 1, { x: 4, y: 5, z: 6 })

      const buffer = packFieldsToInterleavedBuffer(Position, ['x', 'z'], [0, 1])

      expect(buffer).toEqual(new Float32Array([1, 3, 4, 6]))
    })

    it('should use provided target buffer', () => {
      const Position = typedTrait({
        x: Float32Array,
        y: Float32Array,
      }, { initialCapacity: 10 })

      setTypedTraitValues(Position, 0, { x: 1, y: 2 })

      const target = new Float32Array(4)
      const result = packToInterleavedBuffer(Position, [0], target)

      expect(result).toBe(target)
      expect(target[0]).toBe(1)
      expect(target[1]).toBe(2)
    })

    it('should get correct interleaved layout', () => {
      const Position = typedTrait({
        x: Float32Array,
        y: Float32Array,
        z: Float32Array,
      })

      const layout = getInterleavedLayout(Position)

      expect(layout.stride).toBe(12) // 3 * 4 bytes
      expect(layout.offsets.get('x')).toBe(0)
      expect(layout.offsets.get('y')).toBe(4)
      expect(layout.offsets.get('z')).toBe(8)
    })
  })
})

describe('typed trait integration', () => {
  describe('world registration', () => {
    it('should register trait with world', () => {
      const world = {}
      const Position = typedTrait({ x: Float32Array })

      const store = registerTypedTraitWithWorld(world, Position)

      expect(store).toBe(Position.store)
    })
  })

  describe('entity operations', () => {
    it('should add typed trait to entity', () => {
      const world = {}
      const Position = typedTrait({
        x: Float32Array,
        y: Float32Array,
      }, { initialCapacity: 100 })

      addTypedTraitToEntity(world, 5, Position, { x: 100, y: 200 })

      expect(Position.store.x[5]).toBe(100)
      expect(Position.store.y[5]).toBe(200)
    })
  })

  describe('change tracking', () => {
    let Position: ReturnType<typeof typedTrait>

    beforeEach(() => {
      Position = typedTrait({ x: Float32Array }, { initialCapacity: 100 })
    })

    it('should track dirty entities', () => {
      markTypedTraitDirty(Position, 5)
      markTypedTraitDirty(Position, 10)

      const dirty = getTypedTraitDirtyEntities(Position)

      expect(dirty.has(5)).toBe(true)
      expect(dirty.has(10)).toBe(true)
      expect(dirty.size).toBe(2)
    })

    it('should clear dirty entities', () => {
      markTypedTraitDirty(Position, 5)
      clearTypedTraitDirty(Position)

      const dirty = getTypedTraitDirtyEntities(Position)
      expect(dirty.size).toBe(0)
    })

    it('should auto-track via proxy', () => {
      const proxy = createDirtyTrackingProxy(Position, 5)
      
      proxy.x = 100

      expect(Position.store.x[5]).toBe(100)
      expect(getTypedTraitDirtyEntities(Position).has(5)).toBe(true)
    })
  })

  describe('bulk operations', () => {
    it('should provide direct store access', () => {
      const world = {}
      const Position = typedTrait({
        x: Float32Array,
        y: Float32Array,
      }, { initialCapacity: 100 })

      const store = useTypedStore(world, Position)

      // Direct modification
      store.x[0] = 100
      store.y[0] = 200

      expect(Position.store.x[0]).toBe(100)
      expect(Position.store.y[0]).toBe(200)
    })
  })

  describe('compaction', () => {
    it('should compact sparse data', () => {
      const Position = typedTrait({
        x: Float32Array,
        y: Float32Array,
      }, { initialCapacity: 100 })

      // Simulate sparse data (entities 5, 10, 15 are active)
      setTypedTraitValues(Position, 5, { x: 50, y: 51 })
      setTypedTraitValues(Position, 10, { x: 100, y: 101 })
      setTypedTraitValues(Position, 15, { x: 150, y: 151 })

      const activeEntities = new Set([5, 10, 15])
      const remap = compactTypedTrait(Position, activeEntities)

      // Should be remapped to 0, 1, 2
      expect(remap.get(5)).toBe(0)
      expect(remap.get(10)).toBe(1)
      expect(remap.get(15)).toBe(2)

      // Data should be at new locations
      expect(Position.store.x[0]).toBe(50)
      expect(Position.store.x[1]).toBe(100)
      expect(Position.store.x[2]).toBe(150)
    })
  })
})

describe('performance characteristics', () => {
  it('should handle bulk iteration efficiently', () => {
    const Position = typedTrait({
      x: Float32Array,
      y: Float32Array,
    }, { initialCapacity: 10000 })

    const Velocity = typedTrait({
      x: Float32Array,
      y: Float32Array,
    }, { initialCapacity: 10000 })

    // Initialize
    for (let i = 0; i < 10000; i++) {
      Position.store.x[i] = i
      Position.store.y[i] = i * 2
      Velocity.store.x[i] = 1
      Velocity.store.y[i] = 2
    }

    // Measure update time
    const start = performance.now()
    
    const px = Position.store.x
    const py = Position.store.y
    const vx = Velocity.store.x
    const vy = Velocity.store.y

    for (let i = 0; i < 10000; i++) {
      px[i] += vx[i]
      py[i] += vy[i]
    }

    const elapsed = performance.now() - start

    // Should be very fast (sub-millisecond for 10k entities)
    expect(elapsed).toBeLessThan(5)

    // Verify results
    expect(Position.store.x[0]).toBe(1)
    expect(Position.store.y[0]).toBe(2)
  })
})
