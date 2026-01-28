# RFC: Buffer Storage for Traits

## Summary

Extend `trait()` to support buffer storage by detecting typed fields in schemas. Typed fields change the backing storage from JS arrays to TypedArrays.

```typescript
import { trait, types } from 'koota'

// SoA with JS arrays (current)
const Position = trait({ x: 0, y: 0 })

// Buffer storage with TypedArrays (separate arrays per field)
const Position = trait({ x: types.f32(0), y: types.f32(0) })

// AoS with JS objects (current)
const Mesh = trait(() => new THREE.Mesh())
```

**No new patterns. The schema structure determines layout (SoA vs AoS). Typed fields determine storage (Array vs ArrayBuffer).**

## Motivation

Koota has two layout patterns:

- **SoA (object schema)**: Each field stored in separate array
- **AoS (function schema)**: One instance per entity in single array

We extend SoA to support TypedArrays by detecting `types.f32()` etc. in the schema. **Buffer is a storage variant of SoA, not a new layout pattern** - both use the same `store.field[index]` access pattern.

| Layout | Storage    | Schema                | Store Type            |
| ------ | ---------- | --------------------- | --------------------- |
| SoA    | JS         | `{ x: 0 }`            | `{ x: number[] }`     |
| SoA    | Buffer     | `{ x: types.f32(0) }` | `{ x: Float32Array }` |
| AoS    | JS array   | `() => new Thing()`   | `T[]`                 |
| Tag    | none       | `{}`                  | none                  |

## Type Helpers

```typescript
import { types } from 'koota'

// Floating point
types.f32(defaultValue?: number)  // Float32Array
types.f64(defaultValue?: number)  // Float64Array

// Signed integers
types.i8(defaultValue?: number)   // Int8Array
types.i16(defaultValue?: number)  // Int16Array
types.i32(defaultValue?: number)  // Int32Array
types.i64(defaultValue?: bigint)  // BigInt64Array

// Unsigned integers
types.u8(defaultValue?: number)   // Uint8Array
types.u8c(defaultValue?: number)  // Uint8ClampedArray (clamps to 0-255)
types.u16(defaultValue?: number)  // Uint16Array
types.u32(defaultValue?: number)  // Uint32Array
types.u64(defaultValue?: bigint)  // BigUint64Array
```

## API Examples

### Buffer Storage

```typescript
const Position = trait({ x: types.f32(0), y: types.f32(0) })

// Usage identical to regular traits - API is unified
const entity = world.spawn(Position({ x: 100, y: 200 }))
entity.get(Position) // { x: 100, y: 200 } - returns plain object
entity.set(Position, { x: 150 }) // triggers change events

// updateEach works transparently - no special handling needed
world.query(Position, Velocity).updateEach(([pos, vel]) => {
  pos.x += vel.x
  pos.y += vel.y
})

// Store has separate TypedArrays for direct access
const store = getStore(world, Position)
// store.x = Float32Array [100, ...]
// store.y = Float32Array [200, ...]

// Bulk operations via store (bypasses change detection)
for (const eid of world.query(Position)) {
  store.x[eid] += velocity.x
  store.y[eid] += velocity.y
}
// Call entity.changed(Position) if React reactivity is needed
```

### Buffer vs SoA Comparison

Both are SoA layout (separate array per field). Buffer uses ArrayBuffer-backed TypedArrays instead of JS Arrays.

```typescript
// SoA - good for general ECS with JS flexibility
const Position = trait({ x: 0, y: 0 })
// Memory: x:[x0,x1,x2,...] y:[y0,y1,y2,...] (JS Arrays)

// Buffer - good for CPU iteration with TypedArrays
const Position = trait({ x: types.f32(0), y: types.f32(0) })
// Memory: x:[x0,x1,x2,...] y:[y0,y1,y2,...] (TypedArrays)
```

**Use SoA** (default) for general ECS. JS Arrays handle any value type (strings, objects, etc.).

**Use Buffer** when you need:
- **External system interop** - WebGL, WASM, and physics engines benefit from TypedArrays
- **Worker parallelism** - SharedArrayBuffer lets workers read/write without copying. ArrayBuffers are transferable.
- **Strict numeric types** - When f32 vs f64 precision matters, or you need strict numerics like clamped u8 and bigint

### API Compatibility

The core trait API (`get`, `set`, `updateEach`, `getStore`) works transparently with buffer traits. Key differences:

- **Mixed schemas rejected** - All fields must be TypedArray fields or none (see [Mixed Schemas](#mixed-schemas))
- **Relations don't support TypedArray fields** - Use a separate trait for buffer storage (see [Relations](#relations-do-not-support-typedarray-fields))
- **`buffer` option** - Only valid for buffer traits, rejected otherwise

## Buffer Options

```typescript
interface BufferTraitOptions {
  /** Buffer constructor (default: ArrayBuffer) */
  buffer?: ArrayBufferConstructor | SharedArrayBufferConstructor
}

// Buffer storage - no options needed, just works
const Velocity = trait({ x: types.f32(0), y: types.f32(0) })

// Buffer storage with SharedArrayBuffer for workers
const Position = trait({ x: types.f32(0), y: types.f32(0) }, { buffer: SharedArrayBuffer })
```

### Why `buffer` is Trait-Level (Not Field-Level)

Both ArrayBuffer (transferable) and SharedArrayBuffer (shareable) are designed for worker interop. Since workers will likely process entire traits — not individual fields — `buffer` applies at the trait level.

**SharedArrayBuffer's purpose** is to enable memory sharing between the main thread and Web Workers for parallel processing. In an ECS context, if you're parallelizing a physics system:

```typescript
// All fields use SharedArrayBuffer - worker can access entire trait
const Position = trait({ x: types.f32(0), y: types.f32(0) }, {
  buffer: SharedArrayBuffer
});
```

If `x` used `SharedArrayBuffer` but `y` used `ArrayBuffer`, workers would have two access patterns and synchronization mechanisms - increasing the complexity of the parallel processing use case.

**The unit of parallelism in an ECS is the trait**, not individual fields. When a worker processes Position data, it needs all fields (`x`, `y`, `z`), not a subset.

**If fields have different sharing requirements, use separate traits:**

```typescript
// Shared with workers for parallel simulation
const Position = trait({ x: types.f32(0), y: types.f32(0) }, {
  buffer: SharedArrayBuffer
});

// Main thread only - not needed by simulation workers
const RenderHint = trait({ opacity: types.f32(1), layer: types.u8(0) });
```

This keeps the mental model simple: a trait is either worker-compatible or it isn't.

### SharedArrayBuffer Availability

`SharedArrayBuffer` may not be available in all environments:

**Browser:** Requires Cross-Origin Isolation headers (`Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Embedder-Policy: require-corp`). Without these, `SharedArrayBuffer` is `undefined`.

**Node.js:** Generally available without restrictions.

**No automatic fallback:** Koota does NOT fall back to `ArrayBuffer` if `SharedArrayBuffer` is unavailable. If you pass `{ buffer: SharedArrayBuffer }` and `SharedArrayBuffer` is `undefined` in your environment, Koota throws an error at trait creation time:

```
Koota: Invalid buffer option. SharedArrayBuffer may not be available in this environment.
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
const bufferCtor = typeof SharedArrayBuffer !== 'undefined' ? SharedArrayBuffer : ArrayBuffer;

// Create traits with conditional buffer type
const Position = trait(positionSchema, { buffer: bufferCtor });
const Velocity = trait(velocitySchema, { buffer: bufferCtor });

// Your system logic works either way - just runs single-threaded without SAB
function physicsSystem(world: World) {
  // Same code regardless of buffer type
  for (const entity of world.query(Position, Velocity)) {
    // ...
  }
}
```

This approach keeps your ECS logic unchanged - you lose some multi-threading speedups when SAB is unavailable. You must design your worker logic accordingly.

## Capacity and Growth

Buffer storage starts at capacity 1024 and doubles when exceeded (same growth strategy as all koota arrays).

- Creates multiple **separate, contiguous** TypedArrays
- Each array is naturally aligned (Float32Array = 4-byte aligned elements)
- No stride concept - elements are packed

## Design Decisions

### Mixed Schemas

**Question**: Allow `{ x: types.f32(0), y: 0 }` or reject?

**Decision**: Reject at compile time AND runtime. All fields must use the same storage type.

- **Compile-time**: `ConsistentSchema<T>` type returns `never` for mixed schemas, causing TypeScript error
- **Runtime**: `validateSchema()` throws: "Koota: Mixed typed and untyped fields are not allowed"

### Relations Do Not Support TypedArray Fields

**Question**: Should `relation({ store: { amount: types.f32(0) } })` work?

**Decision**: No. TypedArray fields are rejected in relation stores at compile time AND runtime.

**Reasons:**

1. **Non-exclusive relations have nested storage**: For non-exclusive relations, the store structure is `store[key][eid][targetIndex]` - an array of arrays per entity. TypedArrays can't represent this because inner arrays are dynamic length.

2. **Exclusive relations could work, but the API doesn't expose it**: Exclusive relations have flat storage (`store[key][eid]`), which could use TypedArrays. However, the relation API accesses data through `entity.get(Relation(target))` which reconstructs objects - there's no `getStore()` equivalent for bulk iteration.

3. **Access patterns differ**: Traits are designed for bulk iteration (`for (eid of query) { store.x[eid] }`). Relations are designed for targeted lookups (`entity.get(ChildOf(parent))`). TypedArrays benefit the former, not the latter.

4. **Use a separate trait if you need buffer storage**: If you need fast bulk access to relationship-like data, model it as a trait instead:

```typescript
// Instead of this (not supported):
const Targets = relation({ exclusive: true, store: { priority: types.f32(0) } });

// Do this:
const TargetPriority = trait({ priority: types.f32(0) });
const Targets = relation({ exclusive: true });

// Access pattern for bulk iteration:
for (const eid of world.query(TargetPriority, Targets('*'))) {
  priorityStore.priority[eid] *= 0.9; // decay
}
```

**Implementation:**

- **Compile-time**: `RelationSchema<T>` type returns `never` if any field is a TypedField
- **Runtime**: `createRelation()` throws: "Koota: Relation stores do not support TypedArray fields"

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

## Implementation Details

### Type Helper Implementation

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
  i64: createTypedHelper(BigInt64Array),
  u8: createTypedHelper(Uint8Array),
  u8c: createTypedHelper(Uint8ClampedArray),
  u16: createTypedHelper(Uint16Array),
  u32: createTypedHelper(Uint32Array),
  u64: createTypedHelper(BigUint64Array),
}
```

### Detection Logic

```typescript
function createTrait(schema, options?) {
  const isAoS = typeof schema === 'function'
  const isTag = !isAoS && Object.keys(schema).length === 0

  if (!isTag && !isAoS) {
    const isBuffer = isTypedSchema(schema)
    // buffer = separate ArrayBuffers
    // soa = separate JS Arrays
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

### Store Creation

```typescript
// Buffer storage - starts at capacity 1024, doubles when exceeded
function createBufferStore(schema, options = {}) {
  const { buffer = ArrayBuffer } = options
  const store = {}
  for (const key in schema) {
    const field = schema[key]
    const buf = new buffer(INITIAL_CAPACITY * field[$typedArray].BYTES_PER_ELEMENT)
    store[key] = new field[$typedArray](buf)
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

### Storage Types

| Type     | Schema                | Store                 | Memory Layout           |
| -------- | --------------------- | --------------------- | ----------------------- |
| `tag`    | `{}`                  | none                  | none                    |
| `soa`    | `{ x: 0 }`            | `{ x: number[] }`     | `x:[0,1,2] y:[0,1,2]`   |
| `aos`    | `() => T`             | `T[]`                 | `[inst0, inst1, inst2]` |
| `buffer` | `{ x: types.f32(0) }` | `{ x: Float32Array }` | `x:[0,1,2] y:[0,1,2]`   |

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
2. Add `BufferTraitOptions` type with buffer option
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

### Phase 6: Docs and examples

1. Create an example that demonstrates use and lends itself naturally to buffer use
2. Update the README and Koota skill to include TypeArray fields and buffers

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

## References

- Trait detection: `packages/core/src/trait/trait.ts`
- Store creation: `packages/core/src/storage/stores.ts`
- Type helpers: `packages/core/src/types/index.ts`
