---
title: Query
description: Query API
nav: 5
---

A Koota query is a lot like a database query. Parameters define how to find entities and efficiently process them in batches. Queries are the primary way to update and transform your app state, similar to how you'd use SQL to filter and modify database records.

## Defining queries

Inline queries are great for readability and are optimized to be as fast as possible, but there is still some small overhead in hashing the query each time it is called.

```js
// Every time this query runs a hash for the query parameters (Position, Velocity)
// is created and then used to get the cached query internally
function updateMovement(world) {
  world.query(Position, Velocity).updateEach(([pos, vel]) => {})
}
```

While this is not likely to be a bottleneck in your code compared to the actual update function, if you want to save these CPU cycles you can cache the query ahead of time and use the returned ref. This will have the additional effect of creating the internal query immediately on all worlds, otherwise it will get created the first time it is run.

```js
// The internal query is created immediately before it is invoked
const movementQuery = createQuery(Position, Velocity)

// The query ref is used for fast array-based lookup
function updateMovement(world) {
  world.query(movementQuery).updateEach(([pos, vel]) => {})
}
```

## Query all entities

To get all queryable entities you simply query the world with no parameters.

```js
const allEntities = world.query()
```

This differs from `world.entities` which includes all entities, even system ones. Koota excludes its internal system entities from queries to keep userland queries from being polluted.

## Query results

Reading the same query again returns the same result until an entity enters or leaves it, so do not mutate the returned array. Entity order is not guaranteed, but a returned result is never reordered, so you can iterate it while you change the world. `readEach`, `updateEach` and `getPages` visit every entity of the result once in storage order. That order can differ from the array order after entities move between archetypes the query matches, for example when one gains a tag. `sort()` returns a sorted copy and leaves the shared result unchanged. `select()` also returns a new result.

`updateEach` and `readEach` pass the entity as the second argument and its position in the visit order as the third. SoA records (traits defined with a schema object) are scratch objects reused for every entity, so use them inside the callback and copy what you want to keep. AoS records (traits defined with a factory function) are the stored objects themselves, so changes to them persist even in `readEach`. Treat `readEach` records as read-only. `updateEach` stores the fields you changed when the callback returns, so a trait set with `entity.set` inside the callback is not overwritten. Replacing a record in the values array with a new object, as in `values[0] = { x: 1, y: 2 }`, stores the new record's fields the same way. Adding or removing traits or entities from inside the callback works, and the rest of the loop then runs on a slower path.

## Excluding entities from queries

Any entity can be excluded from queries by adding the built-in tag `IsExcluded` to it. System entities get this tag added to them so that they do not interfere with the app.

```js
const entity = world.spawn(Position)
// This entity can no longer be queried
entity.add(IsExcluded)

const entities = world.query(Position)
entities.includes(entity) // This will always be false
```

## Select traits on queries for updates

Query filters entity results and `select` is used to choose what traits are fetched for `updateEach` and `getPages`. This can be useful if your query is wider than the data you want to modify.

```js
// The query finds all entities with Position, Velocity and Mass
world.query(Position, Velocity, Mass)
  // And then select only Mass for updates
  .select(Mass)
  // Only mass will be used in the loop
  .updateEach([mass] => {
    // We are going blackhole
    mass.value += 1
  });
```

## Direct page access

Use `query.getPages()` to iterate cached page views and read or write trait arrays directly. See [Modifying trait stores directly](../advanced/performance.md#modifying-trait-stores-directly) for the page shape, iteration pattern, and change notification behavior.
