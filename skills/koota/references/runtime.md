# Runtime Patterns

How and when to run logic in a Koota application.

## Contents

- [Systems](#systems)
- [Frameloop](#frameloop)
- [Event-driven systems](#event-driven-systems)
- [Time management](#time-management)

## Systems

Systems query the world and update entities. Always take `world: World` as first parameter.

**`core/systems/update-movement.ts`:**

```typescript
import type { World } from 'koota'
import { Position, Velocity, Time } from '../traits'

export function updateMovement(world: World) {
  const { delta } = world.get(Time)!

  world.query(Position, Velocity).updateEach(([pos, vel]) => {
    pos.x += vel.x * delta
    pos.y += vel.y * delta
  })
}
```

**Key points:**

- One file per system
- Name files: `update-{thing}.ts` or `{verb}-{thing}.ts`
- No React imports — systems are pure TypeScript
- Called from frameloop or event handlers

### Actions vs systems

**Actions** are discrete, synchronous data mutations — create, read, update, destroy. Reusable from any call site (systems, UI handlers, tests, imports).

```typescript
// Good actions: direct mutations
createEnemy: (pos) => world.spawn(Position(pos), IsEnemy)
applyDamage: (entity, amount) => entity.set(Health, { hp: entity.get(Health).hp - amount })
```

**Systems** are reactive orchestrators. They observe state changes (`createAdded`, `createChanged`) in the frame loop and coordinate work, including async workflows. They may call actions for mutations, or mutate directly — whichever is clearer.

```typescript
// Good system: reacts to state, orchestrates behavior
export function applyPoison(world: World) {
  world.query(Changed(Poisoned)).readEach(([poison], entity) => {
    entity.set(Health, { hp: entity.get(Health).hp - poison.dps * delta })
  })
}
```

**Litmus test:** if it's a direct mutation callable from multiple contexts, it's an action. If it's "when X happens, do Y" — observation plus orchestration — it's a system.

**Common patterns:**

```typescript
// Query and update each
export function updatePhysics(world: World) {
  world.query(Position, Velocity).updateEach(([position, velocity]) => {
    position.x += velocity.x
  })
}

// If you need both queried data and the entity, prefer readEach
export function processCompletedImages(world: World) {
  world.query(Position).readEach(([position], entity) => {
    // Read position
  })
}

// Read singleton traits
export function updateAI(world: World) {
  const { delta } = world.get(Time)!
  const pointer = world.get(Pointer)!
  // ... use delta and pointer
}
```

## Frameloop

Run systems continuously via requestAnimationFrame.

**`app/frameloop.ts`:**

```typescript
import { useWorld } from 'koota/react'
import { useAnimationFrame } from './utils/use-animation-frame'
import { updateTime } from '../core/systems/update-time'
import { updateMovement } from '../core/systems/update-movement'
import { updateCollisions } from '../core/systems/update-collisions'

export function Frameloop() {
  const world = useWorld()

  useAnimationFrame(() => {
    updateTime(world)
    updateMovement(world)
    updateCollisions(world)
  })

  return null
}
```

**`app/utils/use-animation-frame.ts`:**

```typescript
import { useEffect, useRef } from 'react'

export function useAnimationFrame(callback: () => void) {
  const callbackRef = useRef(callback)
  callbackRef.current = callback

  useEffect(() => {
    let rafId: number

    const loop = () => {
      callbackRef.current?.()
      rafId = requestAnimationFrame(loop)
    }

    rafId = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafId)
  }, [])
}
```

## Event-driven systems

Two strategies for handling events:

**1. Capture for frameloop:** Store event data in traits so frameloop systems can read it. Use for continuous input (pointer, keyboard, viewport).

```typescript
useEffect(() => {
  const handler = (e: PointerEvent) => {
    world.set(Pointer, { x: e.clientX, y: e.clientY })
  }
  window.addEventListener('pointermove', handler)
  return () => window.removeEventListener('pointermove', handler)
}, [world])
```

**2. Run on transition:** Execute system logic immediately when an event fires. Use for discrete events (state machine transitions, network messages, entity lifecycle).

```typescript
// XState transition
useEffect(() => {
  const sub = actor.subscribe((snapshot) => {
    handleStateTransition(world, snapshot)
  })
  return () => sub.unsubscribe()
}, [world, actor])

// System runs on transition
function handleStateTransition(world: World, snapshot: StateSnapshot) {
  if (snapshot.matches('playing')) world.add(IsPlaying)
  else world.remove(IsPlaying)
}
```

**Entity lifecycle events** (`onAdd`, `onRemove`, `onChange`) are also transition-based:

```typescript
useEffect(() => {
  return world.onAdd(Position, (entity) => {
    // Runs immediately when entity gains Position
  })
}, [world])
```

## Time management

Track delta time using a Time trait and updateTime system. Run first in frameloop.

**`core/traits/index.ts`:**

```typescript
export const Time = trait({ last: 0, delta: 0 })
```

**`core/systems/update-time.ts`:**

```typescript
import type { World } from 'koota'
import { Time } from '../traits'

export function updateTime(world: World) {
  const now = performance.now()
  const time = world.get(Time)!
  const delta = Math.min((now - time.last) / 1000, 0.1)
  world.set(Time, { last: now, delta })
}
```

**Key points:**

- `Time` is a singleton trait passed to `createWorld(Time, ...)`
- `delta` is in seconds (divided by 1000)
- `delta` capped at 0.1s to prevent large jumps
- Call `updateTime(world)` first in frameloop

**Usage:**

```typescript
export function updateMovement(world: World) {
  const { delta } = world.get(Time)!

  world.query(Position, Velocity).updateEach(([pos, vel]) => {
    pos.x += vel.x * delta
    pos.y += vel.y * delta
  })
}
```
