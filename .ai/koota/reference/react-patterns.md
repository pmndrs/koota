# React Patterns

Component patterns for Koota + React applications.

## Contents

- [App component](#app-component)
- [Startup component](#startup-component)
- [Frameloop component](#frameloop-component)
- [Renderer pattern](#renderer-pattern)
- [View sync](#view-sync) - Ref pattern, handleInit, sync systems
- [Three.js interop](#threejs-interop)
- [Input patterns](#input-patterns) - Dragging, pointer capture, scoped events

## App component

Compose renderers, frameloop, and startup. Use a fragment.

**`app/app.tsx`:**

```typescript
import { EnemyRenderer } from './renderers/enemy-renderer'
import { PlayerRenderer } from './renderers/player-renderer'
import { Frameloop } from './frameloop'
import { Startup } from './startup'

export function App() {
  return (
    <>
      <PlayerRenderer />
      <EnemyRenderer />
      <Frameloop />
      <Startup />
    </>
  )
}
```

## Startup component

Spawn initial entities on mount. Clean up in `useEffect` return.

**`app/startup.ts`:**

```typescript
import { useActions } from 'koota/react'
import { useEffect } from 'react'
import { actions } from '../core/actions'

export function Startup() {
  const { spawnPlayer, spawnEnemies } = useActions(actions)

  useEffect(() => {
    const player = spawnPlayer()
    const enemies = spawnEnemies(5)

    return () => {
      player.destroy()
      enemies.forEach((e) => e.destroy())
    }
  }, [spawnPlayer, spawnEnemies])

  return null
}
```

## Frameloop component

Run systems in requestAnimationFrame loop. See [runtime.md](runtime.md) for details.

```typescript
import { useWorld } from 'koota/react'
import { useAnimationFrame } from './utils/use-animation-frame'

export function Frameloop() {
  const world = useWorld()

  useAnimationFrame(() => {
    updateTime(world)
    updateMovement(world)
    syncToDOM(world)
  })

  return null
}
```

## Renderer pattern

Renderers query entities and map to View components.

**Naming:**

- `{Domain}Renderer` — Queries and maps to views
- `{Domain}View` — Renders single entity

**Example:**

```typescript
export function EnemyRenderer() {
  const enemies = useQuery(IsEnemy, Position, Health)
  return enemies.map((enemy) => <EnemyView key={enemy.id()} entity={enemy} />)
}

function EnemyView({ entity }: { entity: Entity }) {
  const position = useTrait(entity, Position)
  const health = useTrait(entity, Health)

  if (!position || !health) return null

  return (
    <div
      className="enemy"
      style={{ left: position.x, top: position.y }}
    >
      <div className="health-bar" style={{ width: `${health.value}%` }} />
    </div>
  )
}
```

## View sync

React controls when a view element connects to an entity. Systems only query and mutate; they never add or remove view refs.

**Lifecycle:**

1. Component mounts → add `Ref` trait via `handleInit`
2. Systems mutate traits; sync system writes to view
3. Component unmounts → remove `Ref` trait

### Ref trait

```typescript
// For DOM
export const Ref = trait(() => null! as HTMLDivElement)

// For React Three Fiber
export const Ref = trait(() => null! as THREE.Object3D)
```

### handleInit pattern

```typescript
function CardView({ entity }: { entity: Entity }) {
  const card = useTrait(entity, Card)

  const handleInit = useCallback(
    (div: HTMLDivElement | null) => {
      if (!div || !entity.isAlive()) return
      entity.add(Ref(div))
      return () => entity.remove(Ref)
    },
    [entity]
  )

  return (
    <div ref={handleInit} className="card">
      {card?.name}
    </div>
  )
}
```

### Sync system

```typescript
export function syncToDOM(world: World) {
  world.query(Position, Ref, ZIndex).updateEach(([pos, ref, zIndex]) => {
    if (!ref) return
    ref.style.transform = `translate(${pos.x}px, ${pos.y}px)`
    ref.style.zIndex = zIndex.value.toString()
  })
}
```

### React Three Fiber

```typescript
function EnemyView({ entity }: { entity: Entity }) {
  const handleInit = useCallback(
    (group: THREE.Group | null) => {
      if (!group || !entity.isAlive()) return
      entity.add(Ref(group))
      return () => entity.remove(Ref)
    },
    [entity]
  )

  return (
    <group ref={handleInit}>
      <mesh>
        <boxGeometry />
        <meshStandardMaterial color="red" />
      </mesh>
    </group>
  )
}

export function syncThreeObjects(world: World) {
  world.query(Position, Rotation, Ref).updateEach(([pos, rot, ref]) => {
    if (!ref) return
    ref.position.set(pos.x, pos.y, pos.z)
    ref.rotation.set(rot.x, rot.y, rot.z)
  })
}
```

**Why this pattern:**

- **Performance** — Batch view updates in single system vs individual React renders
- **Separation** — React creates view elements, systems animate them
- **Control** — Run sync at precise points in frameloop

## Three.js interop

Choose based on how much third-party Three code needs to touch transforms.

### Ref-owned transforms (max interop)

Three.js objects stored in trait; systems mutate them directly. External libs (controls, physics) can also mutate transforms. No sync system needed.

**Important**: Use if the user is relying on third party Three libraries. This is likely common.

```typescript
const Transform = trait({
  position: () => new Vector3(),
  rotation: () => new Euler(),
  quaternion: () => new Quaternion(),
})

const handleInit = useCallback(
  (group: THREE.Group | null) => {
    if (!group || !entity.isAlive()) return

    entity.set(Transform, (prev) => ({
      position: group.position.copy(prev.position),
      rotation: group.rotation.copy(prev.rotation),
      quaternion: group.quaternion.copy(prev.quaternion),
      scale: group.scale.copy(prev.scale),
    }))
  },
  [entity]
)

// Systems mutate trait directly - Three sees changes immediately
world.query(Transform, Movement).updateEach(([transform, movement]) => {
  transform.position.add(movement.velocity)
})
```

### Trait-owned transforms (balanced)

Scalar traits for transforms; `Ref` holds `Object3D`. Systems mutate traits; a sync system writes to Three. External libs should not mutate transforms directly.

**Important**: Only use if the user is not relying on third party Three libraries.

```typescript
const Position = trait({ x: 0, y: 0, z: 0 })
const Rotation = trait({ x: 0, y: 0, z: 0 })
const Ref = trait(() => null! as THREE.Object3D)

function syncToThree(world: World) {
  world.query(Position, Rotation, Ref).updateEach(([pos, rot, ref]) => {
    ref.position.set(pos.x, pos.y, pos.z)
    ref.rotation.set(rot.x, rot.y, rot.z)
  })
}
```

## Input patterns

React components respond to user input by adding/removing traits. Systems process these traits.

### Dragging pattern

**Traits:**

```typescript
export const Dragging = trait({
  offset: () => ({ x: 0, y: 0 }),
})
export const Pointer = trait({ x: 0, y: 0 }) // Singleton
```

**System:**

```typescript
export function updateDragging(world: World) {
  const pointer = world.get(Pointer)
  if (!pointer) return

  const { delta } = world.get(Time)!

  world.query(Position, Velocity, Dragging).updateEach(([pos, vel, dragging]) => {
    const oldX = pos.x
    const oldY = pos.y

    pos.x = pointer.x - dragging.offset.x
    pos.y = pointer.y - dragging.offset.y

    const invDelta = delta > 0 ? 1 / delta : 0
    vel.x = (pos.x - oldX) * invDelta
    vel.y = (pos.y - oldY) * invDelta
  })
}
```

**Component:**

```typescript
function CardView({ entity }: { entity: Entity }) {
  const isDragging = useHas(entity, Dragging)

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const rect = event.currentTarget.getBoundingClientRect()
      const centerX = rect.left + rect.width / 2
      const centerY = rect.top + rect.height / 2

      const offset = {
        x: event.clientX - centerX,
        y: event.clientY - centerY,
      }

      entity.set(Position, { x: centerX, y: centerY })
      entity.set(Velocity, { x: 0, y: 0 })
      entity.add(Dragging({ offset }))

      event.currentTarget.setPointerCapture(event.pointerId)
    },
    [entity]
  )

  const handlePointerUp = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      entity.remove(Dragging)
      event.currentTarget.releasePointerCapture(event.pointerId)
    },
    [entity]
  )

  const handleLostPointerCapture = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.buttons === 0) entity.remove(Dragging)
    },
    [entity]
  )

  return (
    <div
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onLostPointerCapture={handleLostPointerCapture}
      className={`card ${isDragging ? 'dragging' : ''}`}
    />
  )
}
```

**Key points:**

- React handles input, adds traits
- System updates position
- Use pointer capture to track outside element
- Check `buttons` on lost capture (React can trigger during re-renders)

### Scoped events

Store input on the world for global scope, or on a scoped entity for element scope.

**Global scope** — Store on world singleton:

```typescript
// Capture global pointer
useEffect(() => {
  const handler = (e: PointerEvent) => {
    world.set(Pointer, { x: e.clientX, y: e.clientY })
  }
  window.addEventListener('pointermove', handler)
  return () => window.removeEventListener('pointermove', handler)
}, [world])

// Consume
world.get(Pointer)
```

**Entity scope** — Store on a dedicated entity with identifier tag:

```typescript
// Traits
export const IsCanvas = trait()
export const IsHovering = trait()
export const Pointer = trait({ x: 0, y: 0 })

// Spawn scoped entity
const canvas = world.spawn(IsCanvas, Pointer)

// Capture scoped pointer
const handlePointerMove = (e: React.PointerEvent) => {
  const canvas = world.queryFirst(IsCanvas)
  if (!canvas) return
  canvas.set(Pointer, { x: e.clientX, y: e.clientY })
  if (!canvas.has(IsHovering)) canvas.add(IsHovering)
}

const handlePointerLeave = () => {
  const canvas = world.queryFirst(IsCanvas)
  if (canvas) canvas.remove(IsHovering)
}

// Consume
world.query(IsCanvas, IsHovering, Pointer).readEach(([pointer]) => {
  // Only runs when hovering canvas
  pointer.x
})
```

**When to use:**

- **Global**: Global input you would listen to on window
- **Scoped**: Element-scoped input (hover, focus, pointer capture)

**Key points:**

- Same traits (`Pointer`, `IsHovering`), different entities (world vs canvas entity)
- Identifier tag (`IsCanvas`) finds the scoped entity
