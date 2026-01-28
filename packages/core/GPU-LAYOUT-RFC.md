# RFC: Render ECS with Multi-Trait Layouts

## Summary

Extend koota with `layout()` for composing multiple traits into GPU-ready interleaved buffers. This enables a **Render ECS** pattern: a separate world optimized for batched instanced rendering, where entities represent GPU instances and traits represent shader resources.

## Motivation

### Two Worlds, Two Purposes

| World        | Storage             | Optimized For                              |
| ------------ | ------------------- | ------------------------------------------ |
| **Gameplay** | SoA typed traits    | CPU iteration, cache-friendly field access |
| **Render**   | Interleaved layouts | GPU upload, batched draw calls             |

The gameplay world uses SoA for per-field iteration (physics, AI, etc.). The render world uses interleaved layouts because:

- Data flows game → render → GPU (minimal CPU iteration)
- GPU wants contiguous per-instance data
- Draw calls batch entities with identical trait composition

### ECS for Rendering

Batched instanced rendering maps naturally to ECS:

| ECS Concept | Render Mapping                                     |
| ----------- | -------------------------------------------------- |
| Entity      | Instance in a draw call                            |
| Trait       | Shader resource (transform, color, material param) |
| Layout      | GPU buffer format                                  |
| Archetype   | Batch (entities with same traits = same draw call) |
| System      | Draw call / render pass                            |
| Relation    | Render graph dependencies                          |

This unlocks composable, flexible rendering:

- Mix and match shader inputs as traits
- Automatic batching by archetype
- Relations can model render graph
- Multiple passes can compose different traits from same source data

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  GAMEPLAY WORLD                                             │
│  - SoA typed traits: Position, Velocity, Health             │
│  - Optimized for CPU iteration                              │
│  - Entities reference render instances via batchId          │
└─────────────────────┬───────────────────────────────────────┘
                      │ Sync (push on change, or batch copy)
                      ▼
┌─────────────────────────────────────────────────────────────┐
│  RENDER WORLD                                               │
│  - Interleaved layouts: Transform, Color, Material          │
│  - Entities = instances in GPU batches                      │
│  - Archetypes = draw call batches                           │
│  - Systems = render passes / draw calls                     │
└─────────────────────┬───────────────────────────────────────┘
                      │ Zero-copy upload (or BYOB mapped)
                      ▼
┌─────────────────────────────────────────────────────────────┐
│  GPU                                                        │
│  - Instance buffers                                         │
│  - Instanced draw calls                                     │
└─────────────────────────────────────────────────────────────┘
```

## Design

### Layout Definition

A layout combines multiple traits into one interleaved buffer:

```typescript
import { layout, types } from 'koota'

// Define traits as shader resources
const Transform = {
  m0: types.f32(1),
  m1: types.f32(0),
  m2: types.f32(0),
  m3: types.f32(0),
  m4: types.f32(0),
  m5: types.f32(1),
  m6: types.f32(0),
  m7: types.f32(0),
  m8: types.f32(0),
  m9: types.f32(0),
  m10: types.f32(1),
  m11: types.f32(0),
  m12: types.f32(0),
  m13: types.f32(0),
  m14: types.f32(0),
  m15: types.f32(1),
}

const Color = {
  r: types.f32(1),
  g: types.f32(1),
  b: types.f32(1),
  a: types.f32(1),
}

// Compose into GPU-ready layout
const StaticMeshInstance = layout(
  {
    transform: Transform,
    color: Color,
  },
  { alignment: 16 }
)
```

### Memory Layout

```
StaticMeshInstance buffer (80 bytes per instance, 16-byte aligned):
┌────────────────────────────────────────────────────────────────────────┐
│ Entity 0: [m0..m15 (64 bytes)] [r,g,b,a (16 bytes)]                    │
│ Entity 1: [m0..m15 (64 bytes)] [r,g,b,a (16 bytes)]                    │
│ Entity 2: [m0..m15 (64 bytes)] [r,g,b,a (16 bytes)]                    │
│ ...                                                                     │
└────────────────────────────────────────────────────────────────────────┘
```

### Render World Usage

```typescript
// Create render world (separate from gameplay)
const renderWorld = createWorld()

// Spawn instances
const instance0 = renderWorld.spawn(StaticMeshInstance)
const instance1 = renderWorld.spawn(StaticMeshInstance)

// Set instance data (writes directly to GPU buffer)
instance0.set(Transform, { m12: 100, m13: 50, m14: 0 }) // position
instance0.set(Color, { r: 1, g: 0, b: 0, a: 1 }) // red

// Get buffer for GPU upload
const buffer = renderWorld.getLayoutBuffer(StaticMeshInstance)
const count = renderWorld.query(StaticMeshInstance).count

// Zero-copy upload and draw
device.queue.writeBuffer(gpuInstanceBuffer, 0, buffer)
renderPass.drawIndexed(indexCount, count)
```

### Game → Render Sync

```typescript
// Gameplay entity references its render instance
const RenderRef = trait({ instanceId: 0 })

// Option 1: Push on change (immediate)
function onPositionChange(gameEntity: Entity) {
  const ref = gameEntity.get(RenderRef)
  const instance = renderWorld.entity(ref.instanceId)
  const pos = gameEntity.get(Position)
  instance.set(Transform, { m12: pos.x, m13: pos.y, m14: pos.z })
}

// Option 2: Batch sync system (per frame)
function syncTransforms(gameWorld: World, renderWorld: World) {
  gameWorld.query(Position, RenderRef, Changed(Position)).readEach(([pos, ref]) => {
    const instance = renderWorld.entity(ref.instanceId)
    instance.set(Transform, { m12: pos.x, m13: pos.y, m14: pos.z })
  })
}
```

### Multiple Render Passes

Different passes compose different traits from same source:

```typescript
// Main pass: full instance data
const MainPassInstance = layout(
  {
    transform: Transform,
    color: Color,
    material: Material,
  },
  { alignment: 16 }
)

// Shadow pass: only needs transform
const ShadowPassInstance = layout(
  {
    transform: Transform,
  },
  { alignment: 16 }
)

// Same game entity, different render instances
gameEntity.set(RenderRef, {
  mainPassId: mainInstance.id(),
  shadowPassId: shadowInstance.id(),
})

// Sync updates both
function syncTransforms(gameWorld, renderWorld) {
  gameWorld.query(Position, RenderRef, Changed(Position)).readEach(([pos, ref]) => {
    const transform = { m12: pos.x, m13: pos.y, m14: pos.z }
    renderWorld.entity(ref.mainPassId).set(Transform, transform)
    renderWorld.entity(ref.shadowPassId).set(Transform, transform)
  })
}
```

### Dense Packing & Pooling

Render instances can be sorted/pooled:

```typescript
const IsVisible = trait()
const IsDead = trait() // Pooled, ready for reuse

// Sort: visible first, dead at end
function sortBatch(renderWorld: World, layout: Layout) {
  // Implementation moves dead entities to end of buffer
  // GPU draws only count=visibleCount, dead instances not rendered
}

// Pool reuse
function spawnRenderInstance(renderWorld: World) {
  // Try to recycle dead instance
  const dead = renderWorld.queryFirst(StaticMeshInstance, IsDead)
  if (dead) {
    dead.remove(IsDead)
    dead.add(IsVisible)
    return dead
  }
  // Otherwise spawn new
  return renderWorld.spawn(StaticMeshInstance, IsVisible)
}
```

### BYOB (Bring Your Own Buffer)

For mapped GPU buffers:

```typescript
// Create layout with external buffer
const mappedBuffer = device.createBuffer({
  size: 80 * 10000,
  usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  mappedAtCreation: true,
})

const StaticMeshInstance = layout({
  transform: Transform,
  color: Color,
}, {
  alignment: 16,
  buffer: mappedBuffer.getMappedRange(),  // BYOB
})

// Writes go directly to GPU-mapped memory
instance.set(Transform, { ... })

// Unmap when ready to render
mappedBuffer.unmap()
```

## API

### `layout(schema, options?)`

Creates a multi-trait interleaved layout.

```typescript
function layout<S extends LayoutSchema>(schema: S, options?: LayoutOptions): Layout<S>

interface LayoutSchema {
  [traitName: string]: {
    [fieldName: string]: TypedField
  }
}

interface LayoutOptions {
  /** Byte alignment for instance stride (default: 4) */
  alignment?: number

  /** External buffer (BYOB mode) */
  buffer?: ArrayBuffer | ArrayBufferLike
}
```

### `world.getLayoutBuffer(layout)`

Returns the underlying ArrayBuffer for GPU upload.

```typescript
const buffer = renderWorld.getLayoutBuffer(StaticMeshInstance)
device.queue.writeBuffer(gpuBuffer, 0, buffer)
```

### `world.query(layout)`

Query entities with a layout (for counting, iteration).

```typescript
const count = renderWorld.query(StaticMeshInstance).count
const instances = renderWorld.query(StaticMeshInstance, IsVisible)
```

### `entity.set(traitFromLayout, values)`

Set individual trait data within a layout.

```typescript
instance.set(Transform, { m12: 100 })
instance.set(Color, { r: 1, g: 0, b: 0 })
```

## Implementation Considerations

### Entity Mapping

Render world entities need stable buffer indices for GPU:

- **Dense packing**: Entity ID ≠ buffer index, requires mapping
- **Sparse with holes**: Entity ID = buffer index, wastes memory but simpler
- **Sorted pools**: Active at front, dead at back, draw count = active count

### Growth

Options:

- **Fixed capacity**: Throw if exceeded (know your instance limits)
- **Double**: Reallocate and copy (invalidates BYOB buffers)

For render world, fixed capacity is often preferred (known GPU limits).

### Trait Independence

Layout traits are NOT independent - they share a buffer:

- Adding/removing traits not supported (use different layout)
- All entities with a layout have the same traits
- This is intentional: matches GPU batch requirements

## Alignment with Koota Principles

### Data-Oriented

Layouts are pure data definitions. Behavior (rendering) is in systems.

### Composable Systems

Each render pass/draw call is a system. Mix and match passes by composing traits.

### Decouple View from Logic

Gameplay world is logic. Render world is view. Clear separation via world boundary.

### Traits as Data

Layout traits are shader resources - transform, color, material params. Pure data.

## Open Questions

1. **Trait reuse across layouts**: Can `Transform` be defined once and used in multiple layouts?

2. **Partial updates**: Can we track dirty regions for partial buffer upload?

3. **Archetype stability**: How to handle entities changing archetypes (different batch)?

4. **Relations for render graph**: How do layout entities participate in relations?

## References

- WebGPU Instancing: https://webgpufundamentals.org/webgpu/lessons/webgpu-instancing.html
- Data-Oriented Design: https://www.dataorienteddesign.com/dodbook/
- ECS for Rendering: https://docs.unity3d.com/Packages/com.unity.entities.graphics
