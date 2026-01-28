# RFC: TypedArray Storage for Traits

## Summary

Extend `trait()` to support TypedArray storage by detecting typed fields in schemas. The existing SoA/AoS patterns determine the memory layout - typed fields just change the backing storage from JS arrays to TypedArrays.

```typescript
import { trait, types } from 'koota'

// SoA with JS arrays (current)
const Position = trait({ x: 0, y: 0 })

// SoA with TypedArrays (separate arrays)
const Position = trait({ x: types.f32(0), y: types.f32(0) })

// AoS with JS objects (current)
const Mesh = trait(() => new THREE.Mesh())

// AoS with interleaved TypedArray (one buffer, optional alignment)
const Position = trait(() => ({ x: types.f32(0), y: types.f32(0), z: types.f32(0) }), {
  alignment: 16,
})
```

**No new patterns. The schema structure determines layout (SoA vs AoS). Typed fields determine storage (JS vs TypedArray).**

## Motivation

Koota already has two layout patterns:

- **SoA (object schema)**: Each field stored in separate array
- **AoS (function schema)**: One instance per entity in single array

We extend both to support TypedArrays by detecting `types.f32()` etc. in the schema:

| Schema                        | Layout | Storage                 |
| ----------------------------- | ------ | ----------------------- |
| `{ x: 0 }`                    | SoA    | JS arrays               |
| `{ x: types.f32(0) }`         | SoA    | TypedArrays             |
| `() => new Thing()`           | AoS    | JS array of instances   |
| `() => ({ x: types.f32(0) })` | AoS    | Interleaved ArrayBuffer |

## Design

### Type Helpers

```typescript
import { types } from 'koota'

// Floating point
types.f32(defaultValue?: number)  // Float32Array
types.f64(defaultValue?: number)  // Float64Array

// Signed integers
types.i8(defaultValue?: number)   // Int8Array
types.i16(defaultValue?: number)  // Int16Array
types.i32(defaultValue?: number)  // Int32Array

// Unsigned integers
types.u8(defaultValue?: number)   // Uint8Array
types.u16(defaultValue?: number)  // Uint16Array
types.u32(defaultValue?: number)  // Uint32Array
```

### Implementation

```typescript
const $typedArray = Symbol('typedArray')

function createTypedHelper<T extends TypedArrayConstructor>(ctor: T) {
  return (defaultValue: number = 0) => ({
    [$typedArray]: ctor,
    default: defaultValue,
  })
}

export const types = {
  f32: createTypedHelper(Float32Array),
  f64: createTypedHelper(Float64Array),
  i8: createTypedHelper(Int8Array),
  i16: createTypedHelper(Int16Array),
  i32: createTypedHelper(Int32Array),
  u8: createTypedHelper(Uint8Array),
  u16: createTypedHelper(Uint16Array),
  u32: createTypedHelper(Uint32Array),
}
```

### Detection Logic

```typescript
function createTrait(schema, options?) {
  const isAoS = typeof schema === 'function'
  const isTag = !isAoS && Object.keys(schema).length === 0

  if (isAoS) {
    // Call once to inspect the template
    const template = schema()
    const isTypedAoS = isTypedFieldObject(template)
    // typed-aos = interleaved buffer
    // aos = array of instances
  } else if (!isTag) {
    const isTypedSoA = isTypedSchema(schema)
    // typed-soa = separate TypedArrays
    // soa = separate JS arrays
  }
}

function isTypedField(value: unknown): boolean {
  return typeof value === 'object' && value !== null && $typedArray in value
}

function isTypedSchema(schema: object): boolean {
  const values = Object.values(schema)
  return values.length > 0 && values.every(isTypedField)
}

function isTypedFieldObject(obj: unknown): boolean {
  if (typeof obj !== 'object' || obj === null) return false
  const values = Object.values(obj)
  return values.length > 0 && values.every(isTypedField)
}
```

### Storage Types

| Type        | Schema                        | Store                 | Memory Layout           |
| ----------- | ----------------------------- | --------------------- | ----------------------- |
| `tag`       | `{}`                          | none                  | none                    |
| `soa`       | `{ x: 0 }`                    | `{ x: number[] }`     | `x:[0,1,2] y:[0,1,2]`   |
| `typed-soa` | `{ x: types.f32(0) }`         | `{ x: Float32Array }` | `x:[0,1,2] y:[0,1,2]`   |
| `aos`       | `() => T`                     | `T[]`                 | `[inst0, inst1, inst2]` |
| `typed-aos` | `() => ({ x: types.f32(0) })` | `ArrayBuffer`         | `[x0,y0, x1,y1, x2,y2]` |

### Store Creation

```typescript
// SoA (typed) - no options, grows automatically
function createTypedSoAStore(schema) {
  const store = {}
  for (const key in schema) {
    const field = schema[key]
    store[key] = new field[$typedArray](0) // Start empty, grow as needed
  }
  return store
}

// AoS (typed/interleaved) - alignment option only
function createTypedAoSStore(template, options = {}) {
  const { alignment = 4 } = options
  const fields = Object.entries(template)

  // Calculate stride with alignment
  let stride = 0
  const offsets = {}
  for (const [name, field] of fields) {
    offsets[name] = stride
    stride += field[$typedArray].BYTES_PER_ELEMENT
  }
  stride = align(stride, alignment)

  // Allocate buffer (starts empty, grows automatically)
  const buffer = new ArrayBuffer(0)

  // Create strided views for each field
  const store = { buffer, stride, capacity: 0 }
  for (const [name, field] of fields) {
    store[name] = createStridedView(buffer, offsets[name], stride, 0, field[$typedArray])
  }

  return store
}
```

## API Examples

### SoA with TypedArrays

```typescript
const Position = trait({ x: types.f32(0), y: types.f32(0) })

// Usage identical to regular traits
const entity = world.spawn(Position({ x: 100, y: 200 }))
entity.get(Position) // { x: 100, y: 200 }
entity.set(Position, { x: 150 })

// Store has separate TypedArrays
const store = getStore(world, Position)
// store.x = Float32Array [100, ...]
// store.y = Float32Array [200, ...]

// Bulk operations
for (const eid of world.query(Position)) {
  store.x[eid] += velocity.x
  store.y[eid] += velocity.y
}
```

### AoS Interleaved (for GPU)

```typescript
const Position = trait(
  () => ({
    x: types.f32(0),
    y: types.f32(0),
    z: types.f32(0),
  }),
  { alignment: 16 }
)

// Usage identical to regular traits
const entity = world.spawn(Position({ x: 100, y: 200, z: 300 }))
entity.get(Position) // { x: 100, y: 200, z: 300 }

// Store has interleaved buffer
const store = getStore(world, Position)
// store.buffer = ArrayBuffer [x0,y0,z0, x1,y1,z1, ...]
// store.stride = 16 (aligned)
// store.x[eid], store.y[eid], store.z[eid] = strided views

// Zero-copy GPU upload
device.queue.writeBuffer(gpuBuffer, 0, store.buffer)
```

### Comparison

```typescript
// SoA typed - good for CPU iteration over single field
const Position = trait({ x: types.f32(0), y: types.f32(0) })
// Memory: x:[x0,x1,x2,...] y:[y0,y1,y2,...]

// AoS typed - good for GPU upload (interleaved)
const Position = trait(() => ({ x: types.f32(0), y: types.f32(0) }))
// Memory: [x0,y0, x1,y1, x2,y2, ...]
```

### With Alignment

```typescript
// Alignment for GPU-friendly layout
const Position = trait(
  () => ({
    x: types.f32(0),
    y: types.f32(0),
    z: types.f32(0),
  }),
  { alignment: 16 }
) // SIMD-friendly stride
```

## Type Inference

```typescript
// TypedField descriptor
interface TypedField<T extends TypedArrayConstructor = TypedArrayConstructor> {
  [$typedArray]: T
  default: number
}

// Element type from TypedArray constructor
type ElementType<T> = T extends Float32ArrayConstructor | Float64ArrayConstructor
  ? number
  : T extends Int8ArrayConstructor | Int16ArrayConstructor | Int32ArrayConstructor
    ? number
    : T extends Uint8ArrayConstructor | Uint16ArrayConstructor | Uint32ArrayConstructor
      ? number
      : never

// Record type (what entity.get() returns)
type InferRecord<T> = {
  [K in keyof T]: T[K] extends TypedField<infer C> ? ElementType<C> : T[K]
}

// Store type for SoA typed
type InferTypedSoAStore<T> = {
  [K in keyof T]: T[K] extends TypedField<infer C> ? InstanceType<C> : never
}

// Store type for AoS typed (interleaved)
interface TypedAoSStore<T> {
  buffer: ArrayBuffer
  stride: number
  // Plus strided views for each field
}
```

## Implementation Plan

### Phase 1: Type Helpers

1. Create `$typedArray` symbol
2. Implement `types.f32`, `types.f64`, `types.i8`, etc.
3. Implement `isTypedField()`, `isTypedSchema()`, `isTypedFieldObject()`
4. Export `types` from main index

### Phase 2: SoA Typed Storage

1. Extend `StoreType` to include `'typed-soa'`
2. Update `createStore()` to handle typed fields
3. Create TypedArrays (grow automatically like regular traits)
4. Fill with default values on growth

### Phase 3: AoS Typed Storage (Interleaved)

1. Add `'typed-aos'` store type
2. Implement `createTypedAoSStore()` with interleaved buffer
3. Create strided views for field access
4. Handle alignment options

### Phase 4: Trait Integration

1. Update `createTrait()` to detect typed schemas
2. Add `InterleavedTraitOptions` type with alignment (AoS only)
3. Pass options through to store creation
4. Update accessor functions if needed

### Phase 5: Type Inference

1. Extend `Schema` type to include TypedField
2. Update `TraitRecord` inference
3. Update `Store` type inference
4. Ensure getStore() returns correct types

### Phase 6: Growth

1. Automatic growth when entity ID exceeds capacity (double, like all koota arrays)
2. SoA typed: Create new larger TypedArrays, copy data
3. AoS typed: Create new larger buffer, copy data, recreate strided views

### Phase 7: Cleanup

1. Deprecate `typedTrait()` and `interleavedTrait()`
2. Update docs and examples
3. Migration guide

## Files to Modify

```
packages/core/src/
├── types/              # NEW
│   └── index.ts        # types.f32, types.f64, etc.
├── storage/
│   ├── types.ts        # Add TypedField, extend Schema, StoreType
│   ├── stores.ts       # Handle typed fields in createStore
│   ├── schema.ts       # Add detection functions
│   └── accessors.ts    # May need typed accessors
├── trait/
│   ├── trait.ts        # Detect typed schemas, add options
│   └── types.ts        # Add TraitOptions, extend types
└── index.ts            # Export types
```

## Capacity, Growth, and Alignment

### SoA vs AoS: Different Needs

**SoA Typed** (`trait({ x: types.f32(0), y: types.f32(0) })`)

- Creates multiple **separate, contiguous** TypedArrays
- Each array is naturally aligned (Float32Array = 4-byte aligned elements)
- No stride concept - elements are packed
- **No options needed** - grows automatically like regular traits

**AoS Typed** (`trait(() => ({ x: types.f32(0), y: types.f32(0) }))`)

- Creates one **interleaved** ArrayBuffer
- Stride alignment matters for GPU/SIMD
- Capacity matters for fixed GPU buffers
- **Options make sense** - user controls buffer characteristics

### Why This Split?

`alignment` only makes sense for interleaved memory (AoS). In SoA:

- Each TypedArray is already element-aligned
- No stride to pad
- GPU uploads separate vertex buffers with their own layout descriptors

Growth is automatic for both (double capacity when exceeded, like all koota arrays). The only option is `alignment` for AoS interleaved - and only when you need it for GPU/SIMD.

### AoS Options (Interleaved Only)

```typescript
interface InterleavedTraitOptions {
  /** Byte alignment for entity stride (default: 4) */
  alignment?: number
}
```

That's it. Growth is automatic (double capacity when exceeded, like everything else in koota). No capacity, maxCapacity, or growth options needed - just align the stride for GPU/SIMD when required.

### API Examples

```typescript
// SoA typed - no options, just works
const Velocity = trait({ x: types.f32(0), y: types.f32(0) })

// AoS interleaved - alignment for GPU/SIMD
const Position = trait(
  () => ({
    x: types.f32(0),
    y: types.f32(0),
    z: types.f32(0),
  }),
  { alignment: 16 }
)

// No alignment needed? No options needed.
const SimpleInterleaved = trait(() => ({
  a: types.f32(0),
  b: types.f32(0),
}))
```

### Explicit Padding

For GPU shaders requiring specific field alignments, add padding fields explicitly:

```typescript
// vec3 with padding for 16-byte alignment (GPU-friendly)
const Position = trait(
  () => ({
    x: types.f32(0),
    y: types.f32(0),
    z: types.f32(0),
    _pad: types.f32(0), // Explicit padding for vec4
  }),
  { alignment: 16 }
)

// mat4 components (64 bytes per entity)
const Transform = trait(
  () => ({
    m00: types.f32(1),
    m01: types.f32(0),
    m02: types.f32(0),
    m03: types.f32(0),
    m10: types.f32(0),
    m11: types.f32(1),
    m12: types.f32(0),
    m13: types.f32(0),
    m20: types.f32(0),
    m21: types.f32(0),
    m22: types.f32(1),
    m23: types.f32(0),
    m30: types.f32(0),
    m31: types.f32(0),
    m32: types.f32(0),
    m33: types.f32(1),
  }),
  { alignment: 16 }
)
```

### Implementation

```typescript
// SoA typed - no options, grows like regular traits
function createTypedSoAStore(schema) {
  const store = {}
  for (const key in schema) {
    const field = schema[key]
    const arr = new field[$typedArray](0) // Start empty, grow as needed
    store[key] = arr
  }
  return store
}

// AoS typed - alignment option only
function createTypedAoSStore(template, options: InterleavedTraitOptions = {}) {
  const { alignment = 4 } = options
  const fields = Object.entries(template)

  // Calculate offsets (field order = memory order)
  let offset = 0
  const offsets: Record<string, number> = {}
  for (const [name, field] of fields) {
    offsets[name] = offset
    offset += field[$typedArray].BYTES_PER_ELEMENT
  }

  // Align stride to boundary
  const stride = Math.ceil(offset / alignment) * alignment

  // Allocate buffer (starts small, grows automatically like everything else)
  const capacity = 0
  const buffer = new ArrayBuffer(stride * capacity)

  // Create strided views
  const store = { buffer, stride, capacity }
  for (const [name, field] of fields) {
    store[name] = createStridedView(buffer, offsets[name], stride, capacity, field[$typedArray])
  }

  return store
}

// Growth: automatic, doubles capacity when needed (like all koota arrays)
function growTypedAoSStore(store, template, newCapacity, alignment) {
  const newBuffer = new ArrayBuffer(store.stride * newCapacity)
  new Uint8Array(newBuffer).set(new Uint8Array(store.buffer)) // Copy existing data

  store.buffer = newBuffer
  store.capacity = newCapacity

  // Recreate strided views
  let offset = 0
  for (const [name, field] of Object.entries(template)) {
    store[name] = createStridedView(newBuffer, offset, store.stride, newCapacity, field[$typedArray])
    offset += field[$typedArray].BYTES_PER_ELEMENT
  }
}
```

### When to Use What

| Use Case                         | Pattern               | Why                                     |
| -------------------------------- | --------------------- | --------------------------------------- |
| General ECS with TypedArrays     | SoA typed             | Simple, cache-friendly per-field access |
| GPU instancing / SIMD            | AoS typed + alignment | Single buffer, stride-aligned           |
| CPU-heavy single-field iteration | SoA typed             | Contiguous memory per field             |

## Open Questions

1. **Mixed schemas**: Allow `{ x: types.f32(0), y: 0 }` or reject?
   - **Recommendation**: Reject. All fields should be same storage type.

2. **Mixed AoS**: Allow `() => ({ x: types.f32(0), y: new Thing() })`?
   - **Recommendation**: Reject. All fields should be typed or none.

## References

- Trait detection: `packages/core/src/trait/trait.ts:55-57`
- Store creation: `packages/core/src/storage/stores.ts`
- Current typedTrait: `packages/core/src/typed/typed-trait.ts`
- Current interleavedTrait: `packages/core/src/layout/interleaved-trait.ts`
