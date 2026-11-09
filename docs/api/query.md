---
title: Query
description: Query API
nav: 5
---

A Koota query is a lot like a database query. Parameters define how to find entities and efficiently process them in batches. Queries are the primary way to update and transform your app state, similar to how you'd use SQL to filter and modify database records.

Query results are live views of entity handles. Use `map((entity, index) => value)` to build a new array in view order, or `toArray()` to copy the entities. `each` walks the membership present when it starts. Structural changes to other entities during a walk are unsupported, so keep adds, removes and destroys to the current entity. Guard stale handles with `entity.isAlive()` when retaining a copy, and preserve selected traits until update callbacks finish writing back.

`each` is a zero-copy interface for reading and writing trait data. It passes each trait as its own argument followed by the entity and index. To keep a copy, call `entity.get(Trait)` for a snapshot. `readEach` and `updateEach` are deprecated, `each` reads at the same cost and writes land directly.

## Defining queries

Inline queries are great for readability and are optimized to be as fast as possible, but there is still some small overhead in hashing the query each time it is called.

```js
// Every time this query runs a hash for the query parameters (Position, Velocity)
// is created and then used to get the cached query internally
function updateMovement(world) {
  world.query(Position, Velocity).each((pos, vel) => {})
}
```

While this is not likely to be a bottleneck in your code compared to the actual update function, if you want to save these CPU cycles you can cache the query ahead of time and use the returned ref. This will have the additional effect of creating the internal query immediately on all worlds, otherwise it will get created the first time it is run.

```js
// The internal query is created immediately before it is invoked
const movementQuery = createQuery(Position, Velocity)

// The query ref is used for fast array-based lookup
function updateMovement(world) {
  world.query(movementQuery).each((pos, vel) => {})
}
```

## Query lifecycle

`world.onEnter(query, callback)` observes entities starting to match a query. `world.onExit(query, callback)` observes entities stopping matching. Both accept a query reference or an array of query parameters and return an unsubscribe function. Subscriptions report future events and do not replay existing matches.

```ts
const moving = createQuery(Position, Velocity)
const stopEnter = world.onEnter(moving, (entity) => startMoving(entity))
const stopExit = world.onExit(moving, (entity) => stopMoving(entity))

world.onEnter([Renderable, Not(Hidden)], (entity) => mount(entity))
world.onExit([Renderable, Not(Hidden)], (entity) => unmount(entity))

stopEnter()
stopExit()
```

Entry and exit describe query membership. Adding `Hidden` makes an entity exit `[Renderable, Not(Hidden)]`, and removing `Hidden` makes it enter. Trait changes, relation target changes and identifier changes can all affect membership.

Trait `onAdd` and `onRemove` hooks retain their own lifecycle timing.

Tracking queries using `Added`, `Removed` or `Changed` retain their tracking semantics. Their events describe the tracking query, not a history of every mutation.

## Query all entities

To get all queryable entities you simply query the world with no parameters.

```js
const allEntities = world.query()
```

This differs from `world.entities` which includes all entities, even system ones. Koota excludes its internal system entities from queries to keep userland queries from being polluted.

## Excluding entities from queries

Any entity can be excluded from queries by adding the built-in tag `IsExcluded` to it. System entities get this tag added to them so that they do not interfere with the app.

```js
const entity = world.spawn(Position)
// This entity can no longer be queried
entity.add(IsExcluded)

const query = world.query(Position)
query.entities.includes(entity) // This will always be false
```

## Select traits on queries for updates

Query filters entity results and `select` is used to choose what traits are fetched for `each` and `getPages`. This can be useful if your query is wider than the data you want to modify.

```js
// The query finds all entities with Position, Velocity and Mass
world
  .query(Position, Velocity, Mass)
  // And then select only Mass for updates
  .select(Mass)
  // Only mass will be used in the loop
  .each((mass) => {
    // We are going blackhole
    mass.value += 1
  })
```

## Relation targets in each

`each` passes relation targets in query order, alongside trait records and before the entity and index. A pair that selects one target passes an `Entity`. A pair that can select several passes a read only array.

| Pair                          | Exclusive | Non-exclusive                           |
| ----------------------------- | --------- | --------------------------------------- |
| `R('*')`                      | `Entity`  | `readonly Entity[]`                     |
| `R(Trait, ...)` or `R(query)` | `Entity`  | `readonly Entity[]` of matching targets |
| `R(entity)`                   | `Entity`  | `Entity`                                |
| Pair inside a modifier        | none      | none                                    |

```ts
const ChildOf = relation({ exclusive: true })
const Contains = relation()

world.query(Position, ChildOf('*'), Contains('*')).each((position, parent, contents, entity) => {
  // parent is an Entity, contents is a readonly Entity[]
})
```

Arrays are snapshots reused between callbacks. Copy with `contents.slice()` to keep one. Structural changes to other entities during a walk are unsupported.

Use `select` to skip reading targets, or `forEach` for entities only. Pairs with stores pass their targets, not a record. `getPages`, `readEach` and `updateEach` keep their trait only layouts.

## Direct entity access

Read `query.entities` once to borrow the query's backing array without copying. Both indexed loops and `for...of` use native array traversal.

```js
const query = world.query(Position)
const entities = query.entities

for (let i = 0, length = entities.length; i < length; i++) {
  draw(entities[i])
}
```

Treat the array as read-only. Finish the loop before running another query or changing membership. Use the view's traversal methods when the loop adds or removes entities or traits, or `toArray()` for an independent copy.

## Direct page access

Use `query.getPages()` to iterate cached page views and read or write trait arrays directly. See [Modifying trait stores directly](../advanced/performance.md#modifying-trait-stores-directly) for the page shape, iteration pattern, and change notification behavior.

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

Call `invalidate()` after changing external sort data or writing directly to stores. The order refreshes on the next access.

```js
sorted.invalidate()
const entities = sorted.entities
```
