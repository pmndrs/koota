# TypedArray Storage for Traits

## The Unified Model

Koota's existing patterns determine memory layout. Typed fields determine storage:

| Schema                        | Layout | Storage                 |
| ----------------------------- | ------ | ----------------------- |
| `{ x: 0 }`                    | SoA    | JS arrays               |
| `{ x: types.f32(0) }`         | SoA    | TypedArrays             |
| `() => new Thing()`           | AoS    | JS array of instances   |
| `() => ({ x: types.f32(0) })` | AoS    | Interleaved ArrayBuffer |

**No new patterns needed.** The existing SoA/AoS distinction naturally maps to separate arrays vs interleaved buffer.

## Target API

```typescript
import { trait, types } from 'koota'

// SoA with JS arrays (current)
const Position = trait({ x: 0, y: 0 })

// SoA with TypedArrays (separate arrays) - no options needed
const Velocity = trait({ x: types.f32(0), y: types.f32(0) })

// AoS with JS objects (current)
const Mesh = trait(() => new THREE.Mesh())

// AoS with interleaved TypedArray (one buffer, GPU-friendly) - alignment option
const Position = trait(
  () => ({
    x: types.f32(0),
    y: types.f32(0),
    z: types.f32(0),
  }),
  { alignment: 16 }
)
```

## Options: AoS Interleaved Only

The only option is `alignment` for **AoS typed (interleaved)** traits. SoA typed traits have no options.

```typescript
interface InterleavedTraitOptions {
  /** Byte alignment for entity stride (default: 4) */
  alignment?: number
}
```

Growth is automatic for both SoA and AoS (double capacity when exceeded, like all koota arrays).

### Use Cases

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

// Explicit padding for GPU shaders (vec4 alignment)
const PositionPadded = trait(
  () => ({
    x: types.f32(0),
    y: types.f32(0),
    z: types.f32(0),
    _pad: types.f32(0),
  }),
  { alignment: 16 }
)

// No alignment needed? No options needed.
const Simple = trait(() => ({ a: types.f32(0), b: types.f32(0) }))
```

## Type Helpers

```typescript
types.f32(default)  // Float32Array
types.f64(default)  // Float64Array
types.i8(default)   // Int8Array
types.i16(default)  // Int16Array
types.i32(default)  // Int32Array
types.u8(default)   // Uint8Array
types.u16(default)  // Uint16Array
types.u32(default)  // Uint32Array
```

## Memory Layouts

```typescript
// SoA typed - separate TypedArrays
const Position = trait({ x: types.f32(0), y: types.f32(0) })
// store.x = Float32Array [x0, x1, x2, ...]
// store.y = Float32Array [y0, y1, y2, ...]

// AoS typed - interleaved buffer
const Position = trait(() => ({ x: types.f32(0), y: types.f32(0) }))
// store.buffer = ArrayBuffer [x0,y0, x1,y1, x2,y2, ...]
// store.x[eid], store.y[eid] = strided views
```

## Implementation Plan

### Phase 1: Type Helpers

```typescript
// packages/core/src/types/index.ts
export const $typedArray = Symbol('typedArray')

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

export function isTypedField(value: unknown): value is TypedField {
  return typeof value === 'object' && value !== null && $typedArray in value
}

export function isTypedSchema(schema: object): boolean {
  const values = Object.values(schema)
  return values.length > 0 && values.every(isTypedField)
}

export function isTypedFieldObject(obj: unknown): boolean {
  if (typeof obj !== 'object' || obj === null) return false
  const values = Object.values(obj)
  return values.length > 0 && values.every(isTypedField)
}
```

### Phase 2: Detection in createTrait

```typescript
// trait/trait.ts
function createTrait(schema, options?) {
  const isAoS = typeof schema === 'function'
  const isTag = !isAoS && Object.keys(schema).length === 0

  let traitType: StoreType
  let template: object | null = null

  if (isTag) {
    traitType = 'tag'
  } else if (isAoS) {
    template = schema() // Call once to inspect
    traitType = isTypedFieldObject(template) ? 'typed-aos' : 'aos'
  } else {
    traitType = isTypedSchema(schema) ? 'typed-soa' : 'soa'
  }

  // ... rest uses traitType and template
}
```

### Phase 3: SoA Typed Storage

SoA typed has no options - grows automatically like regular traits.

```typescript
// storage/stores.ts
function createTypedSoAStore(schema) {
  const store = {}
  for (const key in schema) {
    const field = schema[key]
    // Start empty, grow as needed (like regular SoA)
    store[key] = new field[$typedArray](0)
  }
  return store
}

// Growth handled by existing resize logic, just with TypedArray copy
function growTypedSoAStore(store, schema, newCapacity) {
  for (const key in schema) {
    const field = schema[key]
    const oldArr = store[key]
    const newArr = new field[$typedArray](newCapacity)
    newArr.set(oldArr) // Copy existing data
    newArr.fill(field.default, oldArr.length) // Fill new slots with default
    store[key] = newArr
  }
}
```

### Phase 4: AoS Typed Storage (Interleaved)

AoS typed accepts `alignment` option only. Growth is automatic.

```typescript
// storage/stores.ts
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

  // Store starts empty, grows automatically
  const store = { buffer: new ArrayBuffer(0), stride, capacity: 0 }
  for (const [name, field] of fields) {
    store[name] = createStridedView(store.buffer, offsets[name], stride, 0, field[$typedArray])
  }

  return store
}
```

### Phase 5: Accessor Functions

SoA accessors already work for TypedArrays (same `store.x[index]` pattern).

For AoS typed, need new accessors:

```typescript
// Get: read from strided views into object
function createTypedAoSGetFunction(template) {
  const keys = Object.keys(template)
  return (index, store) => {
    const obj = {}
    for (const key of keys) {
      obj[key] = store[key][index]
    }
    return obj
  }
}

// Set: write to strided views from object
function createTypedAoSSetFunction(template) {
  const keys = Object.keys(template)
  return (index, store, value) => {
    for (const key of keys) {
      if (key in value) store[key][index] = value[key]
    }
  }
}
```

### Phase 6: Growth

Automatic for both (double capacity when exceeded, like all koota arrays).

**SoA typed**: Create new larger TypedArrays, copy data.

**AoS typed**: Create new larger buffer, copy data, recreate strided views.

### Phase 7: Cleanup

1. Deprecate `typedTrait()` → use `trait({ x: types.f32(0) })`
2. Deprecate `interleavedTrait()` → use `trait(() => ({ x: types.f32(0) }))`

## Files to Modify

```
packages/core/src/
├── types/              # NEW
│   └── index.ts        # types.f32, types.f64, $typedArray, detection
├── storage/
│   ├── types.ts        # Extend StoreType, Schema
│   ├── stores.ts       # Add createTypedSoAStore, createTypedAoSStore
│   ├── accessors.ts    # Add typed-aos accessors
│   └── schema.ts       # Update validateSchema
├── trait/
│   ├── trait.ts        # Detection, alignment option (AoS only)
│   └── types.ts        # InterleavedTraitOptions (just alignment)
└── index.ts            # Export types
```

## Current Status

- [x] RFC written (`src/layout/RFC.md`)
- [x] GPU Layout RFC written (`src/layout/GPU-LAYOUT-RFC.md`) - deferred
- [x] Phase 1: Type helpers
- [x] Phase 2: Detection in createTrait
- [x] Phase 3: SoA typed storage
- [x] Phase 4: AoS typed storage (interleaved)
- [x] Phase 5: Accessor functions (implemented via strided proxy views in Phase 4)
- [x] Phase 6: Growth handling (implemented in Phases 3 & 4)
- [x] Phase 7: Cleanup (removed typedTrait, interleavedTrait - never released)

## Render ECS with Multi-Trait Layouts

Multi-trait interleaved buffers (`layout()`) enable a **Render ECS** pattern - a separate world optimized for GPU buffer management. See `src/layout/GPU-LAYOUT-RFC.md` for full details.

**Key insight:** Two worlds, two purposes:

| World    | Storage             | Optimized For |
| -------- | ------------------- | ------------- |
| Gameplay | SoA typed traits    | CPU iteration |
| Render   | Interleaved layouts | GPU upload    |

**ECS maps naturally to batched rendering:**

- Entity = instance in draw call
- Trait = shader resource (transform, color, material)
- Archetype = batch (same traits = same draw call)
- System = render pass

This is a separate feature from single-trait typed storage and can be implemented after the core TypedArray work.

Ready to implement Phase 1?
