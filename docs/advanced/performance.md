---
title: Performance
description: Tips and options for added performance.
nav: 11
---

Performance, safety and readability are all tradeoffs. The standard patterns are plenty fast, but if you are interested in diving deeper here are some quick tips and patterns.

- [Modifying trait stores directly](#modifying-trait-stores-directly)
- [Query optimization](#query-optimization)

## Modifying trait stores directly

For performance-critical operations, `getPages()` returns cached page views with direct access to trait arrays. Each page contains a `stores` tuple in query or `select()` order, `indices` for the matching store offsets, and an `entities` array aligned with those indices. The returned array supports both `for...of` and indexed loops.

```js
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

## Query optimization

Consider these tips to optimize query performance.

### Create update functions once

The standard pattern for `updateEach`, and handlers in general, uses an arrow function. This has great readability since the function logic is colocated with with query, but it comes at the cost of creating a new function for every entity being updated. This can be mitigated by creating the update function once in module scope.

```js
// Create the function once
const handleMove = ([position, velocity]) => {}

function updateMovement(world) {
  // Use it for the updateEach
  world.query(Position, Velocity).updateEach(handleMove)
}
```

### You can use `for of` instead of `forEach` on query results

A query result is just an array of entities with some extra methods. This means you can use `for of` instead of `forEach` to get a nice iterator. Additionally, this will save a little performance since `forEach` calls a function on each member, while `for of` will compile down to what is basically a for loop.

```js
// This is nice and ergonomic but will cost some overhead since we are
// creating a fresh function for each entity and then calling it
world.query().forEach((entity) => {})

// By contrast, this compiles down to a for loop and will have a
// single block of code executed for each entity
for (const entity of world.query()) {
}
```
