# React Hooks

React hooks for integrating Koota with React applications.

## Contents

- [WorldProvider setup](#worldprovider-setup)
- [useQuery](#usequery)
- [useQueryFirst](#usequeryfirst)
- [useTrait](#usetrait)
- [useTag](#usetag)
- [useHas](#usehas)
- [useTarget / useTargets](#usetarget--usetargets)
- [useTraitEffect](#usetraiteffect)
- [Actions](#actions)
- [Change detection](#change-detection)

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

## useQuery

Reactively updates when entities matching the query change (added/removed).

```typescript
import { useQuery } from 'koota/react'

function RocketList() {
  const rockets = useQuery(Position, Velocity)
  return rockets.map((entity) => <RocketView key={entity} entity={entity} />)
}
```

Supports all query modifiers:

```typescript
const staticEntities = useQuery(Position, Not(Velocity))
const characters = useQuery(Or(IsPlayer, IsEnemy))
```

## useQueryFirst

Returns the first matching entity or `undefined`. Reactively updates.

```typescript
import { useQueryFirst } from 'koota/react'

function PlayerHUD() {
  const player = useQueryFirst(IsPlayer, Position)
  if (!player) return null
  return <PlayerStats entity={player} />
}
```

## useTrait

Observes an entity's trait and rerenders when it changes. Returns `undefined` if trait is removed.

```typescript
import { useTrait } from 'koota/react'

function RocketView({ entity }: { entity: Entity }) {
  const position = useTrait(entity, Position)
  if (!position) return null
  return <div style={{ left: position.x, top: position.y }}>🚀</div>
}
```

Works with world traits too:

```typescript
function GameStatus() {
  const world = useWorld()
  const gameState = useTrait(world, GameState)
  return <div>{gameState?.paused ? 'Paused' : 'Running'}</div>
}
```

## useTag

Observes a tag trait. Returns `true` if present, `false` if absent.

```typescript
import { useTag } from 'koota/react'

function ActiveIndicator({ entity }: { entity: Entity }) {
  const isActive = useTag(entity, IsActive)
  if (!isActive) return null
  return <span>🟢</span>
}
```

## useHas

Like `useTag` but for any trait. Returns `true`/`false` based on presence.

```typescript
import { useHas } from 'koota/react'

function HealthIndicator({ entity }: { entity: Entity }) {
  const hasHealth = useHas(entity, Health)
  return hasHealth ? <span>❤️</span> : null
}
```

## useTarget / useTargets

Observe relation targets on an entity.

```typescript
import { useTarget, useTargets } from 'koota/react'

// Single target (exclusive relations)
function TargetDisplay({ entity }: { entity: Entity }) {
  const target = useTarget(entity, Targeting)
  return target ? <span>Targeting: {target.id()}</span> : null
}

// Multiple targets
function InventoryDisplay({ entity }: { entity: Entity }) {
  const items = useTargets(entity, Contains)
  return <ul>{items.map((item) => <li key={item}>{item.id()}</li>)}</ul>
}
```

## useTraitEffect

Subscribe to trait changes without causing rerenders. Runs as an effect.

```typescript
import { useTraitEffect } from 'koota/react'

function SyncMesh({ entity, meshRef }: Props) {
  useTraitEffect(entity, Position, (position) => {
    if (!position) return
    meshRef.current.position.set(position.x, position.y, 0)
  })
  return null
}
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

  damageEntity: (entity: Entity, amount: number) => {
    const health = entity.get(Health)
    if (health) {
      entity.set(Health, { value: Math.max(0, health.value - amount) })
      if (health.value <= 0) entity.add(IsDead)
    }
  },
}))
```

**Using actions:**

- **In React:** `useActions(actions)`
- **In vanilla/systems:** `actions(world)`

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
```

```typescript
// ✅ Mutate then signal
const history = entity.get(History)!
history.undoStack.push(batch)
entity.changed(History)
```

**When to use `changed()`:**

- Mutating AoS trait objects (Sets, Maps, arrays, class instances)
- After direct property mutation on complex objects
- When `set()` isn't used but React needs to update
