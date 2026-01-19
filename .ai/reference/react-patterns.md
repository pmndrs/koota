# React Patterns

Complete guide to integrating Koota with React applications.

## Contents

- [WorldProvider setup](#worldprovider-setup)
- [Actions](#actions) - Creating and using actions
- [Systems](#systems) - Query and update patterns
- [App component](#app-component)
- [Startup component](#startup-component)
- [Frameloop component](#frameloop-component)
- [Time management](#time-management)
- [Change detection](#change-detection) - Triggering React updates
- [Renderer pattern](#renderer-pattern)

## WorldProvider setup

Wrap your app to make the world available to all React hooks.

**`main.tsx`:**

```typescript
import React from 'react'
import ReactDOM from 'react-dom/client'
import { WorldProvider } from 'koota/react'
import { App } from './app/app'
import { world } from './sim/world'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <WorldProvider world={world}>
      <App />
    </WorldProvider>
  </React.StrictMode>
)
```

**`sim/world.ts`:**

```typescript
import { createWorld } from 'koota'
import { Time, Pointer, Viewport } from './traits'

// Pass singleton traits to createWorld for global data
export const world = createWorld(Time, Pointer, Viewport)
```

## Actions

Actions are functions that spawn or modify entities. Use `createActions` to get the world automatically.

**`sim/actions.ts`:**

```typescript
import { createActions, type Entity } from 'koota'
import { Position, Velocity, Health, IsPlayer, IsEnemy, IsDead } from './traits'

export const actions = createActions((world) => ({
  spawnPlayer: () => {
    return world.spawn(Position({ x: 0, y: 0 }), Velocity, Health({ value: 100 }), IsPlayer)
  },

  spawnEnemy: (x: number, y: number) => {
    return world.spawn(Position({ x, y }), Velocity, Health({ value: 50 }), IsEnemy)
  },

  spawnEnemies: (count: number) => {
    const enemies = []
    for (let i = 0; i < count; i++) {
      enemies.push(actions.spawnEnemy(Math.random() * 800, Math.random() * 600))
    }
    return enemies
  },

  damageEntity: (entity: Entity, amount: number) => {
    const health = entity.get(Health)
    if (health) {
      entity.set(Health, { value: Math.max(0, health.value - amount) })
      if (health.value <= 0) {
        entity.add(IsDead)
      }
    }
  },
}))
```

**Using actions:**

- **In React:** `useActions(actions)`
- **In vanilla/systems:** `actions(world)`

**File organization:**

- Simple apps: single `sim/actions.ts`
- Larger apps: `sim/actions/` directory with `{domain}Actions.ts` files

## Systems

Systems query the world and update entities. Always take `world: World` as first parameter.

**`sim/systems/update-movement.ts`:**

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
- No React imports
- Called from frameloop

**Common patterns:**

```typescript
// Query and update each
export function updatePhysics(world: World) {
  world.query(Position, Velocity).updateEach(([pos, vel]) => {
    pos.x += vel.x
  })
}

// Manual iteration (when you need the entity)
export function cleanupDead(world: World) {
  for (const entity of world.query(IsDead)) {
    entity.destroy()
  }
}

// Read singleton traits
export function updateAI(world: World) {
  const { delta } = world.get(Time)!
  const pointer = world.get(Pointer)!
  // ... use delta and pointer
}
```

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
import { actions } from '../sim/actions'

export function Startup() {
  const { spawnPlayer, spawnEnemies } = useActions(actions)

  useEffect(() => {
    // Spawn initial entities
    const player = spawnPlayer()
    const enemies = spawnEnemies(5)

    // Cleanup when component unmounts
    return () => {
      player.destroy()
      enemies.forEach((e) => e.destroy())
    }
  }, [spawnPlayer, spawnEnemies])

  return null
}
```

## Frameloop component

Run systems in requestAnimationFrame loop.

**`app/frameloop.ts`:**

```typescript
import { useWorld } from 'koota/react'
import { useEffect } from 'react'
import { updateMovement } from '../sim/systems/update-movement'
import { updateCollisions } from '../sim/systems/update-collisions'
import { Pointer } from '../sim/traits'
import { useAnimationFrame } from './utils/use-animation-frame'

export function Frameloop() {
  const world = useWorld()

  // Run systems every frame
  useAnimationFrame(() => {
    updateTime(world)
    updateMovement(world)
    updateCollisions(world)
  })

  // Sync window events to world traits
  useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      world.set(Pointer, { x: e.clientX, y: e.clientY })
    }

    window.addEventListener('pointermove', handlePointerMove)
    return () => window.removeEventListener('pointermove', handlePointerMove)
  }, [world])

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

## Time management

Track delta time using a Time trait and updateTime system. Run first in frameloop.

**`sim/traits/index.ts`:**

```typescript
export const Time = trait({ last: 0, delta: 0 })
```

**`sim/systems/update-time.ts`:**

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

## Change detection

Hooks like `useTrait` rerender when change events fire.

**Automatic:** `set()` triggers change events automatically.

```typescript
entity.set(Position, { x: 10, y: 20 }) // Triggers change, useTrait rerenders
world.set(GameState, { paused: true }) // Works for world traits too
```

**Manual (for AoS traits):** When mutating objects directly, signal the change:

```typescript
// ❌ Won't trigger React updates
const history = entity.get(History)!
history.undoStack.push(batch)
history.pending.length = 0
```

```typescript
// ✅ Mutate then signal
const history = entity.get(History)!
history.undoStack.push(batch)
history.pending.length = 0
entity.changed(History)
```

**When to use `changed()`:**

- Mutating AoS trait objects (Sets, Maps, arrays, class instances)
- After direct property mutation on complex objects
- When `set()` isn't used but React needs to update

## Renderer pattern

Renderers query entities and map to View components.

**Naming:**

- `{Domain}Renderer` — Queries and maps to views
- `{Domain}View` — Renders single entity

**File organization:**

- Single file by default: `enemy-renderer.tsx`
- Separate files only for multiple view variants

**Example:**

```typescript
// enemy-renderer.tsx

export function EnemyRenderer() {
  const enemies = useQuery(IsEnemy, Position, Health)
  return enemies.map((enemy) => <EnemyView key={enemy.id()} entity={enemy} />)
}

function EnemyView({ entity }: { entity: Entity }) {
  const position = useTrait(entity, Position)
  const health = useTrait(entity, Health)
  const isDead = useHas(entity, IsDead)

  if (!position || !health) return null

  return (
    <div
      className={`enemy ${isDead ? 'dead' : ''}`}
      style={{ left: position.x, top: position.y }}
    >
      <div className="health-bar" style={{ width: `${health.value}%` }} />
    </div>
  )
}
```

**When to use:**

- Rendering lists of entities
- Separating query logic from presentation
- Creating reusable view components
