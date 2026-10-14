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

```typescript
// Returns QueryResult (Entity[] with extra methods)
const entities = world.query(Position, Velocity)

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

## Query results are shared

Reading a query again returns the same result until an entity enters or leaves it. Do not mutate the array. Entity order is not guaranteed, but a returned result is never reordered, so iterating it while changing the world is safe. `readEach`, `updateEach` and `getPages` visit every entity once in storage order, which can differ from the array order after entities move between archetypes the query matches, for example when one gains a tag. `sort()` and `select()` return new results and leave the shared one unchanged, so use the returned value.

## Records are reused

`updateEach` and `readEach` pass the entity as the second argument and its position in the visit order as the third, unless `{ entity: false }` is set. SoA records (schema traits) are the same scratch objects for every entity. Use them inside the callback and copy what you keep, for example `{ ...pos }`. AoS records (factory traits) are the stored objects, so mutating them persists even in `readEach`. Treat `readEach` records as read-only. `updateEach` stores the fields the callback changed when it returns, so a trait set through `entity.set` inside the callback is not overwritten. Replacing a record in the values array with a new object, for example `values[0] = { x: 1, y: 2 }`, stores the new record's fields the same way. Adding or removing traits or entities inside the callback is allowed, and the rest of the loop then runs on a slower path.

## Skip the entity argument in hot loops

To pass the entity, `updateEach` and `readEach` look up its handle for every row. A callback that only needs the trait records can opt out with `{ entity: false }`. The callback then receives only the records, and in TypeScript declaring an entity or index parameter is a type error. Use it for hot loops that run every frame over many entities. The option works together with `changeDetection`.

```js
world.query(Position, Velocity).updateEach(
  ([position, velocity]) => {
    position.x += velocity.x * delta
    position.y += velocity.y * delta
  },
  { entity: false }
)
```

## Callbacks with the same source share a loop

For a result of 256 or more entities, `updateEach` and `readEach` build a loop specialized to the callback's source text so the engine can inline the callback. Callbacks with identical text share that loop, for example the same arrow function written at two call sites. That is correct even when they capture different values, but a loop shared by several callbacks can run slower than one used by a single callback. At most 256 specialized loops are built, and later callbacks use a shared loop.

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

Use `select()` when query filter is wider than traits needed for update:

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
