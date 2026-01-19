---
name: koota
description: Real-time ECS state management for TypeScript and React. Use when the user mentions koota, ECS, entities, traits, queries, or building data-oriented applications.
---

# Koota ECS

Koota manages state using entities with composable traits.

## Glossary

- **Entity** - A unique identifier pointing to data defined by traits. Spawned from a world.
- **Trait** - A reusable data definition. Can be schema-based (SoA), callback-based (AoS), or a tag.
- **World** - The context for all entities and their data (traits).
- **Query** - Query a world for data (specific traits) and get back entities.

## Design Principles

### Data-oriented design

Behavior is separated from data. Data is defined as traits, entities compose traits, and behavior operates on data via queries.

```typescript
// Data defined as traits
const Position = trait({ x: 0, y: 0 })
const Velocity = trait({ x: 0, y: 0 })

// Entities compose data
const entity = world.spawn(Position, Velocity)

// Behavior operates on data
world.query(Position, Velocity).updateEach(([pos, vel]) => {
  pos.x += vel.x
  pos.y += vel.y
})
```

### Decouple view from logic

Separate core state and logic (the "core") from the view ("app"):

- Run logic independent of rendering
- Swap views while keeping state (2D ↔ 3D)
- Run logic in a worker or on a server

### Prefer traits + actions over classes

Don't use classes to encapsulate data and behavior. Use traits for data and actions for behavior. Only use classes when required by external libraries (e.g., THREE.js objects).

## Directory structure

```
src/
├── main.tsx           # Entry point, wraps App in WorldProvider
├── core/              # Core ECS layer (no React)
│   ├── world.ts       # createWorld() export
│   ├── traits/        # Trait definitions
│   ├── systems/       # Functions that query and update entities
│   └── actions.ts     # Actions for spawning/modifying entities
└── app/               # React view layer
    ├── app.tsx        # Root component
    ├── startup.ts     # Spawns initial entities
    └── frameloop.ts   # Runs systems in requestAnimationFrame
```

**Key principles:**

- `core/` has no React import, it is pure TypeScript
- `app/` React apps that reads from world, mutates with actions
- Systems run in frameloop, not in React renders
- Startup component spawns initial entities

## Trait types

| Type               | Syntax                     | Use when                  | Examples                         |
| ------------------ | -------------------------- | ------------------------- | -------------------------------- |
| **SoA (Schema)**   | `trait({ x: 0 })`          | Simple primitive data     | `Position`, `Velocity`, `Health` |
| **AoS (Callback)** | `trait(() => new Thing())` | Complex objects/instances | `Ref` (DOM), `Keyboard` (Set)    |
| **Tag**            | `trait()`                  | No data, just a flag      | `IsPlayer`, `IsEnemy`, `IsDead`  |

## Trait naming conventions

| Type          | Pattern         | Examples                         |
| ------------- | --------------- | -------------------------------- |
| **Tags**      | Start with `Is` | `IsPlayer`, `IsEnemy`, `IsDead`  |
| **Relations** | Prepositional   | `ChildOf`, `HeldBy`, `Contains`  |
| **Data**      | Noun            | `Position`, `Velocity`, `Health` |

## Relations

Relations build graphs between entities such as hierarchies, inventories, targeting.

```typescript
import { relation } from 'koota'

const ChildOf = relation({ autoDestroy: 'orphan' }) // Hierarchy
const Contains = relation({ store: { amount: 0 } }) // With data
const Targeting = relation({ exclusive: true }) // One target only

// Build graph
const parent = world.spawn()
const child = world.spawn(ChildOf(parent))

// Query children of parent
const children = world.query(ChildOf(parent))

// Query all entities with any ChildOf relation
const allChildren = world.query(ChildOf('*'))

// Get targets from entity
const items = entity.targetsFor(Contains) // Entity[]
const target = entity.targetFor(Targeting) // Entity | undefined
```

For detailed patterns, traversal, ordered relations, and anti-patterns, see [reference/relations.md](reference/relations.md).

## Basic usage

**Define traits:**

```typescript
import { trait, createWorld } from 'koota'

const Position = trait({ x: 0, y: 0 })
const Velocity = trait({ x: 0, y: 0 })
const IsPlayer = trait()
```

**Create world and spawn entities:**

```typescript
const world = createWorld()
const player = world.spawn(Position({ x: 100, y: 50 }), Velocity, IsPlayer)
```

**Query and update:**

```typescript
world.query(Position, Velocity).updateEach(([pos, vel]) => {
  pos.x += vel.x
  pos.y += vel.y
})
```

**Entity operations:**

```typescript
const pos = entity.get(Position)
entity.set(Position, { x: 10, y: 20 })
entity.add(IsPlayer)
entity.remove(Velocity)
entity.destroy()
```

**Entity IDs:**

An entity is internally just a number packed with three components:

- **Entity ID** - The unique identifier within the world
- **Generation ID** - Increments when entity is recycled (detects stale references)
- **World ID** - Which world the entity belongs to

Entities can be stored directly as numbers for persistence or networking. The packed value stays unique even when entity IDs are recycled.

```typescript
entity.id() // Just the entity ID (reused after destroy)
entity // Full packed number (unique forever, safe to store)
```

**Filter queries:**

```typescript
import { Not, Or } from 'koota'

world.query(Position, Not(Velocity)) // static entities
world.query(Or(IsPlayer, IsEnemy)) // players or enemies
```

## React integration

**Imports:** Core types (`World`, `Entity`) from `'koota'`. React hooks from `'koota/react'`.

**Change detection:** `entity.set()` and `world.set()` trigger change events that cause hooks like `useTrait` to rerender. For AoS traits where you mutate objects directly, manually signal with `entity.changed(Trait)`.

For complete React patterns, see [reference/react-patterns.md](reference/react-patterns.md):

- WorldProvider setup
- Actions with `createActions`
- Systems (always take `world: World`)
- Frameloop component
- Startup component
- Renderer pattern
- Time management

## Interaction patterns

For advanced interaction patterns, see [reference/interaction-patterns.md](reference/interaction-patterns.md):

- Dragging pattern
- Ref pattern for view syncing (DOM and R3F)
- Pointer capture
- Event handling

## Quick reference

**System signature:**

```typescript
export function updateMovement(world: World) {
  world.query(Position, Velocity).updateEach(([pos, vel]) => {
    pos.x += vel.x
    pos.y += vel.y
  })
}
```

**Actions:**

```typescript
export const actions = createActions((world) => ({
  spawnPlayer: () => world.spawn(Position, Velocity, IsPlayer),
  damageEntity: (entity: Entity, amount: number) => {
    const health = entity.get(Health)
    if (health) entity.set(Health, { value: health.value - amount })
  },
}))
```

**Using actions:**

- React: `const { spawnPlayer } = useActions(actions)`
- Vanilla: `const { spawnPlayer } = actions(world)`
