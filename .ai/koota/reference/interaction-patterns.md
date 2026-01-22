# Interaction Patterns

React components respond to user input by adding/removing traits. Systems process these traits.

## Contents

- [Dragging pattern](#dragging-pattern) - Complete drag-and-drop implementation
- [Ref pattern for view syncing](#ref-pattern-for-view-syncing) - DOM and React Three Fiber examples

## Dragging pattern

**`sim/traits/index.ts`:**

```typescript
export const Dragging = trait({
  offset: () => ({ x: 0, y: 0 }),
})
export const Pointer = trait({ x: 0, y: 0 }) // Singleton, passed to createWorld
```

**`sim/systems/update-dragging.ts`:**

```typescript
import type { World } from 'koota'
import { Dragging, Pointer, Position, Velocity, Time } from '../traits'

export function updateDragging(world: World) {
  const pointer = world.get(Pointer)
  if (!pointer) return

  const { delta } = world.get(Time)!

  world.query(Position, Velocity, Dragging).updateEach(([pos, vel, dragging]) => {
    const oldX = pos.x
    const oldY = pos.y

    // Update position to follow pointer
    pos.x = pointer.x - dragging.offset.x
    pos.y = pointer.y - dragging.offset.y

    // Calculate velocity for momentum
    const invDelta = delta > 0 ? 1 / delta : 0
    vel.x = (pos.x - oldX) * invDelta
    vel.y = (pos.y - oldY) * invDelta
  })
}
```

**`app/components/card-view.tsx`:**

```typescript
function CardView({ entity }: { entity: Entity }) {
  const card = useTrait(entity, Card)
  const isDragging = useHas(entity, Dragging)

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      // Read position from DOM because cards are initially laid out by CSS (flex/grid)
      // If your elements are positioned by the Position trait, use entity.get(Position) instead
      const rect = event.currentTarget.getBoundingClientRect()
      const centerX = rect.left + rect.width / 2
      const centerY = rect.top + rect.height / 2

      // Calculate offset from center
      const offset = {
        x: event.clientX - centerX,
        y: event.clientY - centerY
      }

      // Start dragging: set position, reset velocity, add Dragging trait
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

  const handlePointerCancel = useCallback(() => {
    entity.remove(Dragging)
  }, [entity])

  const handleLostPointerCapture = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      // Only remove dragging if mouse button is released
      if (e.buttons === 0) entity.remove(Dragging)
    },
    [entity]
  )

  return (
    <div
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onLostPointerCapture={handleLostPointerCapture}
      className={`card ${isDragging ? 'dragging' : ''}`}
    >
      {card?.name}
    </div>
  )
}
```

**Key points:**

- React handles input, adds traits
- System updates position
- Use `useHas` for conditional styling
- Store offset in trait for grab-anywhere behavior
- Use pointer capture to track outside element
- Check `buttons` on lost capture (React can trigger during re-renders)
- Calculate offset from position source of truth:
  - CSS layout (flex/grid): read from DOM (`getBoundingClientRect()`)
  - Position trait (`transform: translate()`): read from trait (`entity.get(Position)`)

**Syncing global pointer:**

```typescript
// In Frameloop component
useEffect(() => {
  const handlePointerMove = (e: PointerEvent) => {
    world.set(Pointer, { x: e.clientX, y: e.clientY })
  }

  window.addEventListener('pointermove', handlePointerMove)
  return () => window.removeEventListener('pointermove', handlePointerMove)
}, [world])
```

## Ref pattern for view syncing

For performance-critical view updates, attach refs to entities and batch sync in a system.

**`sim/traits/index.ts`:**

```typescript
// For DOM
export const Ref = trait(() => null! as HTMLDivElement)

// For React Three Fiber
export const Ref = trait(() => null! as THREE.Object3D)
```

### DOM Example

```typescript
// In your View component
function CardView({ entity }: { entity: Entity }) {
  const card = useTrait(entity, Card)

  const handleInit = useCallback(
    (div: HTMLDivElement | null) => {
      // Check if entity is alive to guard against React Strict Mode
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

// In your sync system
export function syncToDOM(world: World) {
  world.query(Position, Ref, ZIndex).updateEach(([pos, ref, zIndex]) => {
    if (!ref) return
    ref.style.transform = `translate(${pos.x}px, ${pos.y}px)`
    ref.style.zIndex = zIndex.value.toString()
  })
}
```

### React Three Fiber Example

```typescript
// In your View component
function EnemyView({ entity }: { entity: Entity }) {
  const handleInit = useCallback(
    (group: THREE.Group | null) => {
      // Check if entity is alive to guard against React Strict Mode
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

// In your sync system
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

**When to use:**

- Animating many elements (cards, particles, enemies)
- High-frequency position/transform updates
- Fine control over render timing
