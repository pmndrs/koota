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
- **Archetype** - A unique combination of traits that entities share.
- **Query** - Fetches entities matching an archetype. The primary way to batch update state.

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

```typescript
import { trait, createWorld } from 'koota'

// 1. Define traits
const Position = trait({ x: 0, y: 0 })
const Velocity = trait({ x: 0, y: 0 })
const IsPlayer = trait()

// 2. Create world and spawn entities
const world = createWorld()
const player = world.spawn(Position({ x: 100, y: 50 }), Velocity, IsPlayer)

// 3. Query and update
world.query(Position, Velocity).updateEach(([pos, vel]) => {
  pos.x += vel.x
  pos.y += vel.y
})
```

## Entities

Entities are unique identifiers that compose traits. Spawned from a world.

```typescript
// Spawn
const entity = world.spawn(Position, Velocity)

// Read/write traits
entity.get(Position)              // Read trait data
entity.set(Position, { x: 10 })   // Write (triggers change events)
entity.add(IsPlayer)              // Add trait
entity.remove(Velocity)           // Remove trait
entity.has(Position)              // Check if has trait

// Destroy
entity.destroy()
```

**Entity IDs:**

An entity is internally a number packed with entity ID, generation ID (for recycling), and world ID. Safe to store directly for persistence or networking.

```typescript
entity.id() // Just the entity ID (reused after destroy)
entity      // Full packed number (unique forever)
```

## Queries

Queries fetch entities matching an archetype and are the primary way to batch update state.

```typescript
// Query and update
world.query(Position, Velocity).updateEach(([pos, vel]) => {
  pos.x += vel.x
  pos.y += vel.y
})

// Get first match
const player = world.queryFirst(IsPlayer, Position)

// Filter with modifiers
world.query(Position, Not(Velocity)) // Has Position but not Velocity
world.query(Or(IsPlayer, IsEnemy))   // Has either trait
```

For tracking changes, caching queries, and advanced patterns, see [reference/queries.md](reference/queries.md).

## React integration

**Imports:** Core types (`World`, `Entity`) from `'koota'`. React hooks from `'koota/react'`.

**Change detection:** `entity.set()` and `world.set()` trigger change events that cause hooks like `useTrait` to rerender. For AoS traits where you mutate objects directly, manually signal with `entity.changed(Trait)`.

For complete React patterns, see [reference/react-patterns.md](reference/react-patterns.md):

- Query hooks (`useQuery`, `useQueryFirst`, `useTrait`)
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
