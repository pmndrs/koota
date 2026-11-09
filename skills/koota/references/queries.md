# Queries

Complete guide to querying entities in Koota.

## Contents

- [Basic queries](#basic-queries)
- [Query lifecycle](#query-lifecycle) - Entering and exiting matching conditions
- [Iterating entities](#iterating-entities) - Direct and indexed loops
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

A query result is a cached live view over the query's entities. Use `map((entity, index) => value)` to build a new array in view order, or `toArray()` to copy the entities. Structural changes during view traversal with `for...of`, `forEach`, or `each` are deferred. Adds, removes, destroys and machine transitions made inside a walk apply in call order when the outermost walk ends, so every row keeps its entity, traits and relation targets until then. Reads inside the walk see the world as it was when the walk started plus any data writes and spawned entities. Spawning is immediate and the new entity shows up on the next run.

```typescript
// Returns a QueryView, a live borrowed view
const entities = world.query(Position, Velocity)
entities.length
entities.first
// Negative indices count from the end
entities.at(-1)

// Entities destroyed during a walk stay alive until it ends, entities spawned
// show up on the next run. Finish every for of loop you start, a suspended
// iterator holds every structural change in the world.
for (const entity of entities) {
  if (entity.has(IsDead)) entity.destroy()
}

// Indexed loops over query.entities get the same guarantee from world.defer
world.defer(() => {
  const dense = entities.entities
  for (let i = 0; i < dense.length; i++) if (dense[i].has(IsDead)) dense[i].destroy()
})

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

## Query lifecycle

Use `world.onEnter` when an entity starts matching and `world.onExit` when it stops matching. Pass a query reference or an array of query parameters. Both return unsubscribe functions and report future events without replaying existing matches.

```typescript
const moving = createQuery(Position, Velocity)
const stopEnter = world.onEnter(moving, (entity) => startMoving(entity))
const stopExit = world.onExit(moving, (entity) => stopMoving(entity))

world.onEnter([Renderable, Not(Hidden)], (entity) => mount(entity))
world.onExit([Renderable, Not(Hidden)], (entity) => unmount(entity))

stopEnter()
stopExit()
```

Adding `Hidden` makes an entity exit the visibility query, and removing it makes the entity enter. Relations and identifiers use the same lifecycle. Trait `onAdd` and `onRemove` hooks retain their lifecycle timing. Tracking queries retain their tracking semantics.

## Iterating entities

Use `for...of` to iterate entities directly. For the fastest possible iteration, index `query.entities`, with the same performance as a native array.

```typescript
const query = world.query(Position)

for (const entity of query) {
  draw(entity)
}

const entities = query.entities
for (let i = 0, length = entities.length; i < length; i++) {
  draw(entities[i])
}
```

Treat the backing array as read-only and finish using it before another query run or membership change.

## Query modifiers

Filter queries with logical modifiers.

```typescript
import { Not, Or } from 'koota'

// Has Position but NOT Velocity
world.query(Position, Not(Velocity))

// Has IsPlayer OR IsEnemy
world.query(Or(IsPlayer, IsEnemy))

// Has IsPlayer OR lacks IsHidden
world.query(Or(IsPlayer, Not(IsHidden)))

// Combine modifiers
world.query(Position, Not(Velocity), Or(IsPlayer, IsEnemy))

// Not and Or accept relations and relation pairs
world.query(Not(ChildOf)) // No parent at all
world.query(Position, Not(ChildOf(player))) // Not a child of player
world.query(Or(ChildOf(redTeam), ChildOf(blueTeam), IsBoss))
```

Tracking modifiers accept pairs too. `Added(ChildOf(parent))` tracks that one pair, while `Added(ChildOf), ChildOf(parent)` tracks any `ChildOf` pair and filters by target.

`Or(Not(T))` is equivalent to `Not(T)`. A branch `Not(A, B)` requires both traits to be absent, while separate branches `Or(Not(A), Not(B))` require either absence.

## Tracking modifiers

Track structural and data changes. Create a separate modifier for each independent reader. `Added` and `Changed` start with current matches. `Removed` starts with retained removals.

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

// Track one pair
const newChildrenOfParent = world.query(Added(ChildOf(parent)))
```

**Removed** - Entities that removed a trait since the last query, including entities destroyed while holding it. Removed data stays available through `each` arguments and `getPages` stores so you can clean up resources, until the trait is added back or the entity is evicted. Custom `remove` accessors may clear retained data. Other terms match a destroyed entity on the traits it died with, and `isAlive` distinguishes a destroy from a live removal.

The world defers cleanup of existing data for its newest `retain` destroyed entities, fixed by `createWorld({ retain })` and defaulting to 1024. Each destroy that exceeds the cap evicts the oldest, even if unread. Eviction invalidates the handle, removes pending and exposed query entries, releases stored values and relations, and makes the id reusable. Slow readers can miss evicted entities. Zero cleans up destroyed entities immediately, while live trait removals still work.

Readers consume independent batches within the cap. A run exposes its pending batch and the next run replaces it. Reading does not clean up retained data, so late queries can still seed retained destroys in destroy order. The cap bounds entity count, not bytes, and allocated pages remain available for reuse. Mutations that overflow the cap also invalidate evicted entries in existing views and snapshots.

Ordinary entity reads and writes require liveness, even inside `Removed` callbacks. A live entity's `get` returns `undefined` after the trait is removed. Retained relation pairs still match query filters, including children destroyed with their parent:

```typescript
const stoppedEntities = world.query(Removed(Velocity))

// Track orphaned entities
const orphaned = world.query(Removed(ChildOf))

// Track entities that lost one pair, also when the entity or the target is destroyed
const lostChildren = world.query(Removed(ChildOf(parent)))

// Register after destruction and still read retained data
const entity = world.spawn(ServerSync)
entity.destroy()
const RemovedSync = createRemoved()
world.query(RemovedSync(ServerSync)).each((serverSync) => serverSync.disconnect())
world.query(Removed(ChildOf), ChildOf(parent)).forEach((child) => detach(child, parent))
```

**Changed** - Entities whose traits were added or written since the last query. The first run includes all current matches. `onChange` reports the same additions and writes, but callbacks only observe future events:

```typescript
const ChangedPosition = createChanged()
const moved = world.spawn(Position)

// First run includes existing Position traits
world.query(ChangedPosition(Position))

moved.set(Position, { x: 10 })
// Later runs include additions and writes
const movedEntities = world.query(ChangedPosition(Position))

// Track relation additions and data writes
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

Static and tracking branches can share an `Or`. For `Or(Changed(Position), IsVisible)`, visible entities match every read and changes to other entities are consumed once. Any tracking modifier outside `Or` must still fire for an entity to match.

**Key points:**

- Create instances at module scope, not inside functions
- Tracking resets after each query execution
- Changed tracks trait additions, `set()` calls, `entity.changed()` signals, and changes detected by `each`
- Removed needs no warm up, a reader created after a removal sees it on its first run while the trait stays removed and the entity has not been evicted

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

Use `sortBy` to order a query by a numeric key from one trait.

```ts
const byX = (position: Readonly<{ x: number }>) => position.x
const sorted = world.query(Position, Velocity).sortBy(Position, byX)

sorted.each((position, velocity) => {
  console.log(position.x, velocity.x)
})
```

The selector reads borrowed trait data once per entity per refresh. Treat it as read-only and do not retain it or change the world inside the selector. Every entity must carry the key trait, as with `select`. The view keeps the original query's callback arguments.

Return a number other than `NaN`. Infinities are valid. Invalid keys throw `[SORT_KEY]` when assertions are enabled. Keys sort ascending, so return a negative key for descending order, such as `position => -position.x`. Equal keys keep base-query order after membership changes and the previous sorted order after data-only changes.

The key trait is tracked automatically. Membership changes or possible writes to that trait refresh the order on the next access. An `each` walk that includes the key trait counts as a possible write. Reading `sorted.entities` reuses a clean cached order without calling the selector. If the selector throws, the previous array stays unchanged and the next access retries.

Keep the selector function stable when requesting the view repeatedly. Views are cached by query view, key trait and selector identity. Call `invalidate()` when external state used by the selector changes or after writing directly to stores without change notification.

Use `sort` for a custom entity comparator.

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
