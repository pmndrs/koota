# RFC: TypedArray Storage for Traits

## Summary

Extend `trait()` to support TypedArray storage by detecting typed fields in schemas. Typed fields change the backing storage from JS arrays to TypedArrays.

```typescript
import { trait, types } from 'koota'

// SoA with JS arrays (current)
const Position = trait({ x: 0, y: 0 })

// Buffer storage with TypedArrays (separate arrays per field)
const Position = trait({ x: types.f32(0), y: types.f32(0) })

// AoS with JS objects (current)
const Mesh = trait(() => new THREE.Mesh())
```

**No new patterns. The schema structure determines layout (SoA vs AoS). Typed fields determine storage (JS vs TypedArray).**

## Motivation

Koota already has two layout patterns:

- **SoA (object schema)**: Each field stored in separate array
- **AoS (function schema)**: One instance per entity in single array

We extend SoA to support TypedArrays by detecting `types.f32()` etc. in the schema:

| Schema                | Layout  | Storage               |
| --------------------- | ------- | --------------------- |
| `{ x: 0 }`            | SoA     | JS arrays             |
| `{ x: types.f32(0) }` | Buffer  | TypedArrays           |
| `() => new Thing()`   | AoS     | JS array of instances |

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

  if (!isTag && !isAoS) {
    const isBuffer = isTypedSchema(schema)
    // buffer = separate TypedArrays
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
```

### Storage Types

| Type     | Schema                | Store                 | Memory Layout           |
| -------- | --------------------- | --------------------- | ----------------------- |
| `tag`    | `{}`                  | none                  | none                    |
| `soa`    | `{ x: 0 }`            | `{ x: number[] }`     | `x:[0,1,2] y:[0,1,2]`   |
| `buffer` | `{ x: types.f32(0) }` | `{ x: Float32Array }` | `x:[0,1,2] y:[0,1,2]`   |
| `aos`    | `() => T`             | `T[]`                 | `[inst0, inst1, inst2]` |

### Store Creation

```typescript
// Buffer storage - no options, grows automatically
function createBufferStore(schema) {
  const store = {}
  for (const key in schema) {
    const field = schema[key]
    store[key] = new field[$typedArray](0) // Start empty, grow as needed
  }
  return store
}
```

## API Examples

### Buffer Storage with TypedArrays

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

### Buffer vs SoA Comparison

```typescript
// SoA - good for general ECS with JS flexibility
const Position = trait({ x: 0, y: 0 })
// Memory: x:[x0,x1,x2,...] y:[y0,y1,y2,...] (JS arrays)

// Buffer - good for CPU iteration with TypedArrays
const Position = trait({ x: types.f32(0), y: types.f32(0) })
// Memory: x:[x0,x1,x2,...] y:[y0,y1,y2,...] (TypedArrays)
```

### Why `bufferType` is Trait-Level (Not Field-Level)

The `bufferType` option applies to ALL fields in a trait, not individual fields. This is intentional.

**SharedArrayBuffer's purpose** is to enable memory sharing between the main thread and Web Workers for parallel processing. In an ECS context, if you're parallelizing a physics system:

```typescript
// All fields use SharedArrayBuffer - worker can access entire trait
const Position = trait({ x: types.f32(0), y: types.f32(0) }, {
  bufferType: SharedArrayBuffer
});
```

If `x` used `SharedArrayBuffer` but `y` used `ArrayBuffer`, workers could only access half the data - breaking the parallel processing use case.

**The unit of parallelism in an ECS is the trait**, not individual fields. When a worker processes Position data, it needs all fields (`x`, `y`, `z`), not a subset.

**If fields have different sharing requirements, use separate traits:**

```typescript
// Shared with workers for parallel simulation
const Position = trait({ x: types.f32(0), y: types.f32(0) }, {
  bufferType: SharedArrayBuffer
});

// Main thread only - not needed by simulation workers
const RenderHint = trait({ opacity: types.f32(1), layer: types.u8(0) });
```

This keeps the mental model simple: a trait is either worker-compatible or it isn't.

### SharedArrayBuffer Availability

`SharedArrayBuffer` may not be available in all environments:

**Browser:** Requires Cross-Origin Isolation headers (`Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Embedder-Policy: require-corp`). Without these, `SharedArrayBuffer` is `undefined`.

**Node.js:** Generally available without restrictions.

**No automatic fallback:** Koota does NOT fall back to `ArrayBuffer` if `SharedArrayBuffer` is unavailable. If you pass `{ bufferType: SharedArrayBuffer }` and `SharedArrayBuffer` is `undefined` in your environment, Koota throws an error at trait creation time:

```
Koota: Invalid bufferType option. SharedArrayBuffer may not be available in this environment.
Check availability with: typeof SharedArrayBuffer !== "undefined"
```

This is intentional - silently falling back would cause worker code to read stale data, which is extremely difficult to debug.

**Designing for optional SAB support:**

If your application needs to work with or without `SharedArrayBuffer`, design your trait creation to be conditional:

```typescript
// Define schemas separately from buffer options
const positionSchema = { x: types.f32(0), y: types.f32(0), z: types.f32(0) };
const velocitySchema = { vx: types.f32(0), vy: types.f32(0), vz: types.f32(0) };

// Check if SharedArrayBuffer is available
const bufferType = typeof SharedArrayBuffer !== 'undefined' ? SharedArrayBuffer : ArrayBuffer;

// Create traits with conditional buffer type
const Position = trait(positionSchema, { bufferType });
const Velocity = trait(velocitySchema, { bufferType });

// Your system logic works either way - just runs single-threaded without SAB
function physicsSystem(world: World) {
  // Same code regardless of buffer type
  for (const entity of world.query(Position, Velocity)) {
    // ...
  }
}
```

This approach keeps your ECS logic unchanged - you just lose the multi-threading speedup when SAB is unavailable.

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

// Store type for buffer storage
type InferBufferStore<T> = {
  [K in keyof T]: T[K] extends TypedField<infer C> ? InstanceType<C> : never
}
```

## Implementation Plan

### Phase 1: Type Helpers

1. Create `$typedArray` symbol
2. Implement `types.f32`, `types.f64`, `types.i8`, etc.
3. Implement `isTypedField()`, `isTypedSchema()`
4. Export `types` from main index

### Phase 2: Buffer Storage

1. Extend `StoreType` to include `'buffer'`
2. Update `createStore()` to handle typed fields
3. Create TypedArrays (grow automatically like regular traits)
4. Fill with default values on growth

### Phase 3: Trait Integration

1. Update `createTrait()` to detect typed schemas
2. Add `BufferTraitOptions` type with bufferType option
3. Pass options through to store creation
4. Update accessor functions if needed

### Phase 4: Type Inference

1. Extend `Schema` type to include TypedField
2. Update `TraitRecord` inference
3. Update `Store` type inference
4. Ensure getStore() returns correct types

### Phase 5: Growth

1. Automatic growth when entity ID exceeds capacity (double, like all koota arrays)
2. Buffer: Create new larger TypedArrays, copy data

### Phase 6: Cleanup

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

## Capacity and Growth

### Buffer Storage

**Buffer** (`trait({ x: types.f32(0), y: types.f32(0) })`)

- Creates multiple **separate, contiguous** TypedArrays
- Each array is naturally aligned (Float32Array = 4-byte aligned elements)
- No stride concept - elements are packed
- **Grows automatically** like regular traits (double capacity when exceeded)
- Optional `bufferType` for SharedArrayBuffer (worker scenarios)

### Buffer Options

```typescript
interface BufferTraitOptions {
  /** Buffer constructor (default: ArrayBuffer) */
  bufferType?: ArrayBufferConstructor | SharedArrayBufferConstructor
}
```

### API Examples

```typescript
// Buffer storage - no options needed, just works
const Velocity = trait({ x: types.f32(0), y: types.f32(0) })

// Buffer storage with SharedArrayBuffer for workers
const Position = trait({ x: types.f32(0), y: types.f32(0) }, { bufferType: SharedArrayBuffer })
```

### Implementation

```typescript
// Buffer storage - grows like regular traits
function createBufferStore(schema, options = {}) {
  const { bufferType = ArrayBuffer } = options
  const store = {}
  for (const key in schema) {
    const field = schema[key]
    const buffer = new bufferType(INITIAL_CAPACITY * field[$typedArray].BYTES_PER_ELEMENT)
    store[key] = new field[$typedArray](buffer)
  }
  return store
}

// Growth: automatic, doubles capacity when needed (like all koota arrays)
function growBufferStore(store, minCapacity) {
  let newCapacity = store._capacity
  while (newCapacity < minCapacity) {
    newCapacity = Math.ceil(newCapacity * GROWTH_FACTOR)
  }
  // Create new larger TypedArrays, copy data
}
```

### When to Use What

| Use Case                         | Pattern | Why                                     |
| -------------------------------- | ------- | --------------------------------------- |
| General ECS with JS flexibility  | SoA     | Standard JS arrays                      |
| General ECS with TypedArrays     | Buffer  | Simple, cache-friendly per-field access |
| CPU-heavy single-field iteration | Buffer  | Contiguous memory per field             |
| Multi-threaded with workers      | Buffer  | SharedArrayBuffer support               |

## Open Questions

1. **Mixed schemas**: Allow `{ x: types.f32(0), y: 0 }` or reject?
   - **Decision**: Reject. All fields should be same storage type. Mixed schemas fall back to SoA.

## References

- Trait detection: `packages/core/src/trait/trait.ts`
- Store creation: `packages/core/src/storage/stores.ts`
- Type helpers: `packages/core/src/types/index.ts`
