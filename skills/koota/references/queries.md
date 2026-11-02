# Queries

Complete guide to querying entities in Koota.

## Contents

- [Basic queries](#basic-queries)
- [Indexed loops](#indexed-loops) - Zero-copy entity access
- [Query modifiers](#query-modifiers) - Not, Or
- [Tracking modifiers](#tracking-modifiers) - Added, Removed, Changed
- [Caching queries](#caching-queries) - createQuery for performance
- [Change detection](#change-detection) - automatic with each
- [Query + select](#query--select) - Select subset of traits for updates
- [Ordered views](#ordered-views) - Cached entity ordering
- [Direct store access](#direct-store-access) - getPages for performance

## Basic queries

Queries fetch entities that share specific traits (archetypes).

`each` is a zero-copy interface for reading and writing trait data. It passes each trait as its own argument followed by the entity and index. To keep a copy, call `entity.get(Trait)` for a snapshot.

A query result is a cached live view over the query's entities. Use `map((entity, index) => value)` to build a new array in view order, or `toArray()` to copy the entities. Structural changes during view traversal with `for...of`, `forEach`, or `each` are safe.

```typescript
// Returns a QueryView, a live borrowed view
const entities = world.query(Position, Velocity)
entities.length
entities.first
// Negative indices count from the end
entities.at(-1)

// Entities destroyed during a walk stay in the view until it ends and are
// skipped by each, entities spawned show up on the next run.
// Finish every for of loop you start, a suspended iterator keeps removals pending.
for (const entity of entities) {
  if (entity.has(IsDead)) entity.destroy()
}

// The view changes with the world, copy it to keep it
const kept = entities.toArray()

// Relation filters can target entities that match a query
const playerChildren = world.query(ChildOf(IsPlayer))

// each passes each trait as its own argument, then the entity and index
world.query(Position, Velocity).each((pos, vel) => {
  pos.x += vel.x
  pos.y += vel.y
})

// Reads go through each as well
world.query(Position).each((pos, entity) => {
  // ...
})

// Get first match only
const player = world.queryFirst(IsPlayer, Position)

// Query all entities (excludes system entities)
const allEntities = world.query()
```

## Indexed loops

Read `query.entities` once to borrow the regular query view's backing array without copying.

```typescript
const query = world.query(Position)
const entities = query.entities

for (let i = 0, length = entities.length; i < length; i++) {
  draw(entities[i])
}
```

Treat the array as read-only. Finish the loop before running another query or changing membership. Use `for...of` on the view or `each` when the loop adds or removes entities or traits. Use `toArray()` to keep an independent copy.

Both indexed loops and `for...of` on `query.entities` use native array traversal.

Median time per 10,000-entity checksum on an Apple M4 Pro, across eight fresh processes with assertions disabled:

| Indexed traversal | Node 24.14.0 | Node 26.1.0 |
| ----------------- | -----------: | ----------: |
| Native array      |      3.23 µs |     3.30 µs |
| `query.entities`  |      3.27 µs |     3.29 µs |

Run `pnpm bench '@query-indexed-raw' -n query-entities` to compare them with plain arrays.

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

Track structural and data changes. Each tracking modifier must be created as a unique instance. The world records its own history, so a query created at any time, including inside a system body, still reports earlier events on its first run. Write history for `Changed` is recorded once a `Changed` term names the trait, so build `Changed` terms at module scope to record from the start. Destroyed entities are released at destroy unless the world was created with `collect: 'manual'`, see Destroyed below.

```typescript
import { createAdded, createRemoved, createChanged, createDestroyed } from 'koota'

// Create unique instances (typically at module scope)
const Added = createAdded()
const Removed = createRemoved()
const Changed = createChanged()
const Destroyed = createDestroyed()
```

**Added** - Entities that added a trait since last query:

```typescript
const newPositions = world.query(Added(Position))

// Track relation additions
const newChildren = world.query(Added(ChildOf))
```

**Removed** - Entities that removed a trait since last query (includes destroyed entities, readable until `world.collect()` on a manual world):

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

**Destroyed** - Entities destroyed while holding a trait since last query. Needs `createWorld({ collect: 'manual' })`, which keeps destroyed entities readable until `world.collect()` runs, usually once per loop. Removing the trait first does not count, writes to the entity throw, and other terms filter on the traits held at destroy:

```typescript
const world = createWorld({ collect: 'manual' })

world.query(Destroyed(ServerSync)).readEach(([serverSync]) => serverSync.disconnect())

world.collect() // End of the loop
```

See [runtime.md](runtime.md#event-driven-systems) for `world.emit` and `createListener`, which build on Destroyed.

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
- Removed and Destroyed need no warm up, a reader created after the event still sees it on its first run

## Caching queries

Inline queries hash parameters each call. For hot paths, cache with `createQuery`.

```typescript
import { createQuery } from 'koota'

// Define once at module scope
const movementQuery = createQuery(Position, Velocity)

function updateMovement(world: World) {
  // Fast array-based lookup
  world.query(movementQuery).each((pos, vel) => {
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

`each` automatically detects changes for traits tracked via `onChange` or `Changed` modifier.

```typescript
// Default: selective detection (only tracked traits)
world.query(Position, Velocity).each((pos, vel) => {
  pos.x += vel.x
})
```

**Shallow comparison:**

Change detection uses shallow comparison like React. Objects and arrays only detect changes if replaced:

```typescript
// ❌ Mutation not detected (same array reference)
world.query(Inventory).each((inv) => {
  inv.items.push(item)
})

// ✅ New array detected
world.query(Inventory).each((inv) => {
  inv.items = [...inv.items, item]
})

// ✅ Mutate and manually signal
world.query(Inventory).each((inv, entity) => {
  inv.items.push(item)
  entity.changed(Inventory)
})
```

## Query + select

Use `select()` when query filter is wider than traits needed for update.

```typescript
// Query filters by Position + Velocity + Mass
// But only Mass is needed in the update
world
  .query(Position, Velocity, Mass)
  .select(Mass)
  .each((mass) => {
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

## Ordered views

Use `sort` to read query results in a chosen order.

```ts
const query = world.query(Position)
const sorted = query.sort(
  (a: Entity, b: Entity) => a.get(Position)!.x - b.get(Position)!.x,
  [Position]
)

sorted.each((position) => {
  console.log(position.x)
})
```

Pass the traits read by the comparator in the dependency array. The order refreshes on the next access after membership changes or writes to those traits. Omit the array or pass `[]` to sort on every access.

Active view walks keep their starting order. Re-enter the view after they finish to refresh it.

`sorted.entities` checks whether the order needs refreshing, then returns the cached array without an extra copy. Read it once before the loop:

```js
const entities = sorted.entities

for (let i = 0, length = entities.length; i < length; i++) {
  draw(entities[i])
}
```

Treat the array as read-only. Finish reading before accessing the view again or changing membership or sort data. Use the view's traversal methods for guarded walks, or `toArray()` for an independent copy.
