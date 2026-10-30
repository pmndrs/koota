# Queries

Complete guide to querying entities in Koota.

## Contents

- [Basic queries](#basic-queries)
- [Query modifiers](#query-modifiers) - Not, Or
- [Tracking modifiers](#tracking-modifiers) - Added, Removed, Changed
- [Caching queries](#caching-queries) - createQuery for performance
- [Change detection](#change-detection) - updateEach options
- [Query + select](#query--select) - Select subset of traits for updates
- [Direct store access](#direct-store-access) - getPages for performance

## Basic queries

Queries fetch entities that share specific traits (archetypes).

`readEach` and `updateEach` reuse the callback's state array, SoA records and tuple arrays. Treat these values as temporary and copy records and tuple arrays before retaining them. `entity.get(Trait)` provides an independent snapshot of stored state. AoS traits still return their stored values. Nested iterations use separate scratch data.

A result is an array like view over the query's own entity list with `length`, `at(index)`, `for of`, `forEach`, `map`, `filter`, `find`, `some`, `every`, `includes` and `indexOf`. It is not an `Array`, so use `at(0)` instead of `[0]`. Every run returns the same view, so a run allocates nothing. It is current until the next structural change, and the next run commits pending removals, which can move entries, or swaps in the next batch for tracking queries. Call `toArray()` or `sort()` to copy it. Entities destroyed during a walk stay in the view until the walk ends and are skipped by `updateEach`. Entities spawned during a walk are visited on the next run.

```typescript
// Returns QueryResult, a live borrowed view
const entities = world.query(Position, Velocity)
const first = entities.at(0)
const kept = entities.toArray()

// Relation filters can target entities that match a query
const playerChildren = world.query(ChildOf(IsPlayer))

// Batch update with updateEach
world.query(Position, Velocity).updateEach(([pos, vel]) => {
  pos.x += vel.x
  pos.y += vel.y
})

// Batch read with readEach
world.query(Position).readEach(([pos], entity) => {
  // ...
})

// Get first match only
const player = world.queryFirst(IsPlayer, Position)

// Query all entities (excludes system entities)
const allEntities = world.query()
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

Inline queries hash parameters each call. For hot paths, cache with `createQuery`.

```typescript
import { createQuery } from 'koota'

// Define once at module scope
const movementQuery = createQuery(Position, Velocity)

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
world.query(Position).updateEach(
  ([pos]) => {
    pos.x += 1
  },
  { changeDetection: 'never' }
)

// Always trigger change events for all mutated traits (DEFAULT)
world.query(Position).updateEach(
  ([pos]) => {
    pos.x += 1
  },
  { changeDetection: 'always' }
)
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

Use `select()` when query filter is wider than traits needed for update. It returns a view over the same entities bound to the selected traits, cached per trait list, so selecting every frame allocates nothing.

```typescript
// Query filters by Position + Velocity + Mass
// But only Mass is needed in the update
world
  .query(Position, Velocity, Mass)
  .select(Mass)
  .updateEach(([mass]) => {
    mass.value += 1
  })
```

## Direct store access

For performance-critical operations, `getPages()` returns cached page views with direct access to trait arrays. Each page contains a `stores` tuple in query or `select()` order, `indices` for the matching store offsets, and an `entities` array aligned with those indices. The returned array supports both `for...of` and indexed loops.

```typescript
const pages = world.query(Position, Velocity).getPages()

for (const {
  stores: [position, velocity],
  indices,
} of pages) {
  for (let i = 0; i < indices.length; i++) {
    const offset = indices[i]
    position.x[offset] += velocity.x[offset] * delta
    position.y[offset] += velocity.y[offset] * delta
  }
}
```

`page.indices[i]` is the store offset for `page.entities[i]`. Use it to access values like `position.x[offset]` (SoA) or `objects[offset]` (AoS).

Query each frame and finish the loop before adding or removing traits or entities. Direct writes don't notify subscribers. Call `entity.changed(Trait)` when you need notifications.
