# Queries

Complete guide to querying entities in Koota.

## Contents

- [Basic queries](#basic-queries)
- [Query modifiers](#query-modifiers) - Not, Or
- [Tracking modifiers](#tracking-modifiers) - Added, Removed, Changed
- [Caching queries](#caching-queries) - defineQuery for performance
- [Change detection](#change-detection) - updateEach options
- [Query + select](#query--select) - Select subset of traits for updates
- [Direct store access](#direct-store-access) - useStores for performance

## Basic queries

Queries fetch entities that share specific traits (archetypes).

```typescript
// Returns QueryResult (Entity[] with extra methods)
const entities = world.query(Position, Velocity)

// Process with forEach
entities.forEach((entity) => {
  const pos = entity.get(Position)
  // ...
})

// Batch update with updateEach (preferred)
world.query(Position, Velocity).updateEach(([pos, vel]) => {
  pos.x += vel.x
  pos.y += vel.y
})

// Get first match only
const player = world.queryFirst(IsPlayer, Position)

// Query all entities (excludes system entities)
const allEntities = world.query()

// Use for...of for iterator
for (const entity of world.query(Position)) {
  // ...
}
```

## Query modifiers

Filter queries with logical modifiers.

```typescript
import { Not, Or } from 'koota'

// Has Position but NOT Velocity
world.query(Position, Not(Velocity))

// Has IsPlayer OR IsEnemy
world.query(Or(IsPlayer, IsEnemy))

// Combine modifiers
world.query(Position, Not(Velocity), Or(IsPlayer, IsEnemy))
```

## Tracking modifiers

Track structural and data changes. Each tracking modifier must be created as a unique instance.

```typescript
import { createAdded, createRemoved, createChanged } from 'koota'

// Create unique instances (typically at module scope)
const Added = createAdded()
const Removed = createRemoved()
const Changed = createChanged()
```

**Added** - Entities that added a trait since last query:

```typescript
const newPositions = world.query(Added(Position))

// Track relation additions
const newChildren = world.query(Added(ChildOf))
```

**Removed** - Entities that removed a trait since last query (includes destroyed entities):

```typescript
const stoppedEntities = world.query(Removed(Velocity))

// Track orphaned entities
const orphaned = world.query(Removed(ChildOf))
```

**Changed** - Entities whose trait data changed since last query:

```typescript
const movedEntities = world.query(Changed(Position))

// Track relation data changes
const updatedChildren = world.query(Changed(ChildOf))
```

**Logical AND (default):**

When multiple traits are passed to a tracking modifier, it uses logical AND. Only entities where **all** specified traits match the condition are returned:

```typescript
// Entities where BOTH Position AND Velocity were added
const fullyAdded = world.query(Added(Position, Velocity))

// Entities where BOTH Position AND Velocity were removed
const fullyRemoved = world.query(Removed(Position, Velocity))

// Entities where BOTH Position AND Velocity have changed
const fullyUpdated = world.query(Changed(Position, Velocity))
```

**Logical OR:**

To track entities where **any** of the specified traits match, wrap individual tracking modifiers in `Or()`:

```typescript
import { Or } from 'koota'

// Entities where EITHER Position OR Velocity was added
const eitherAdded = world.query(Or(Added(Position), Added(Velocity)))

// Entities where EITHER Position OR Velocity was removed
const eitherRemoved = world.query(Or(Removed(Position), Removed(Velocity)))

// Entities where EITHER Position OR Velocity has changed
const eitherChanged = world.query(Or(Changed(Position), Changed(Velocity)))
```

**Key points:**

- Create instances at module scope, not inside functions
- Tracking resets after each query execution
- Changed only tracks `set()` calls and `entity.changed()` signals

## Caching queries

Inline queries hash parameters each call. For hot paths, cache with `defineQuery`.

```typescript
import { defineQuery } from 'koota'

// Define once at module scope
const movementQuery = defineQuery(Position, Velocity)

function updateMovement(world: World) {
  // Fast array-based lookup
  world.query(movementQuery).updateEach(([pos, vel]) => {
    pos.x += vel.x
    pos.y += vel.y
  })
}
```

**When to use:**

- Systems called every frame
- Queries in tight loops
- Performance-critical code

**When inline is fine:**

- Event handlers
- Startup/cleanup code
- Infrequent operations

## Change detection

`updateEach` automatically detects changes for traits tracked via `onChange` or `Changed` modifier.

```typescript
// Default: selective detection (only tracked traits)
world.query(Position, Velocity).updateEach(([pos, vel]) => {
  pos.x += vel.x
})

// Never trigger change events (silent updates)
world.query(Position).updateEach(([pos]) => {
  pos.x += 1
}, { changeDetection: 'never' })

// Always trigger change events for all mutated traits (DEFAULT)
world.query(Position).updateEach(([pos]) => {
  pos.x += 1
}, { changeDetection: 'always' })
```

**Shallow comparison:**

Change detection uses shallow comparison like React. Objects and arrays only detect changes if replaced:

```typescript
// ❌ Mutation not detected (same array reference)
world.query(Inventory).updateEach(([inv]) => {
  inv.items.push(item)
})

// ✅ New array detected
world.query(Inventory).updateEach(([inv]) => {
  inv.items = [...inv.items, item]
})

// ✅ Mutate and manually signal
world.query(Inventory).updateEach(([inv], entity) => {
  inv.items.push(item)
  entity.changed(Inventory)
})
```

## Query + select

Use `select()` when query filter is wider than traits needed for update:

```typescript
// Query filters by Position + Velocity + Mass
// But only Mass is needed in the update
world.query(Position, Velocity, Mass)
  .select(Mass)
  .updateEach(([mass]) => {
    mass.value += 1
  })
```

## Direct store access

For maximum performance, access SoA stores directly with `useStores`:

```typescript
world.query(Position, Velocity).useStores(([position, velocity], entities) => {
  for (let i = 0; i < entities.length; i++) {
    const eid = entities[i].id()
    position.x[eid] += velocity.x[eid] * delta
    position.y[eid] += velocity.y[eid] * delta
  }
})
```

**When to use:**

- Updating thousands of entities per frame
- SIMD-style operations
- When profiling shows `updateEach` as bottleneck

**Tradeoffs:**

- Bypasses safety checks
- No automatic change detection
- More verbose code
