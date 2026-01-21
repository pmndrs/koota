---
name: koota-ts
description: Real-time ECS state management for TypeScript and React. Use when the user mentions koota, ECS, entities, traits, queries, or building data-oriented applications.
---

# Koota ECS

Koota manages state using entities with composable traits.

## Glossary

- **Entity** - A unique identifier pointing to data defined by traits. Spawned from a world.
- **Trait** - A reusable data definition. Can be schema-based (SoA), callback-based (AoS), or a tag.
- **Relation** - A directional connection between entities to build graphs.
- **World** - The context for all entities and their data (traits).
- **Query** - Query a world for data (specific traits) and get back entities.

## Design Principles

### Data-oriented

Behavior is separated from data. Data is defined as traits, entities compose traits, and systems mutate data on traits via queries.

```typescript
// Data defined as traits
const Position = trait({ x: 0, y: 0 })
const Velocity = trait({ x: 0, y: 0 })

// Entities compose data
const entity = world.spawn(Position, Velocity)

// Systems batch update data
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

Prefer not to use classes to encapsulate data and behavior. Use traits for data and actions for behavior. Only use classes when required by external libraries (e.g., THREE.js objects) or the user prefers it.

## Directory structure

If the user has a preferred structure, follow it. Otherwise, use this guidance: the directory structure should mirror how the app's data model is organized. Separate core state/logic from the view layer:

- **Core** - Pure TypeScript. Traits, systems, actions, world. No view imports.
- **View** - Reads from world, mutates via actions. Organized by domain/feature.

```
src/
├── core/              # Pure TypeScript, no view imports
│   ├── traits/
│   ├── systems/
│   ├── actions/
│   └── world.ts
└── features/          # View layer, organized by domain
```

Files are organized by role, not by feature slice. Traits and systems are composable and don't map cleanly to features.

For detailed patterns and monorepo structures, see [reference/architecture.md](reference/architecture.md).

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
