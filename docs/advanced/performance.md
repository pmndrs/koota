---
title: Performance
description: Tips and options for added performance.
nav: 11
---

Performance, safety and readability are all tradeoffs. The standard patterns are plenty fast, but if you are interested in diving deeper here are some quick tips and patterns.

- [Modifying trait stores directly](#modifying-trait-stores-directly)
- [Query optimization](#query-optimization)

## Modifying trait stores directly

For performance-critical operations, `getPages()` returns cached page views with direct access to trait arrays. Each page contains a `stores` tuple in query or `select()` order, `indices` for the matching store offsets in ascending order, and an `entities` array aligned with those indices. The returned array supports both `for...of` and indexed loops.

```js
const pages = world.query(Position, Velocity).getPages()

for (let p = 0; p < pages.length; p++) {
  const { stores, indices } = pages[p]
  const [position, velocity] = stores
  for (let i = 0; i < indices.length; i++) {
    const offset = indices[i]
    position.x[offset] += velocity.x[offset] * delta
    position.y[offset] += velocity.y[offset] * delta
  }
}
```

`page.indices[i]` is the store offset for `page.entities[i]`. Use it to access values like `position.x[offset]` (SoA) or `objects[offset]` (AoS).

A page also carries `start`, `end` and `contiguous`. When `contiguous` is true every offset from `start` to `end` matches, so the loop can walk the range directly and skip the indices lookup. Pages are contiguous whenever their entities were spawned together and none left the query, which is the common case. Walk the pages with a counted loop as above, a `for of` with destructuring costs about 20% more on a large walk.

```js
for (let p = 0; p < pages.length; p++) {
  const { stores, indices, start, end, contiguous } = pages[p]
  const [position, velocity] = stores
  if (contiguous) {
    for (let offset = start; offset < end; offset++) {
      position.x[offset] += velocity.x[offset] * delta
    }
  } else {
    for (let i = 0; i < indices.length; i++) {
      const offset = indices[i]
      position.x[offset] += velocity.x[offset] * delta
    }
  }
}
```

A tuple field's components start at the offset times the tuple's length. Write them in place, or read and write with a math library's buffer helpers such as `vec3.fromBuffer` and `vec3.toBuffer`.

```js
const Transform = trait({ position: [0, 0, 0] })
const Velocity = trait({ value: [0, 0, 0] })

for (const {
  stores: [transform, velocity],
  indices,
} of world.query(Transform, Velocity).getPages()) {
  for (let i = 0; i < indices.length; i++) {
    const offset = indices[i] * 3
    transform.position[offset] += velocity.value[offset] * delta
    transform.position[offset + 1] += velocity.value[offset + 1] * delta
    transform.position[offset + 2] += velocity.value[offset + 2] * delta
  }
}
```

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

A query returns a live view over its entities, not an array. Every run returns the same view and iterating it with `for of` allocates nothing, so a system can run a query every frame for free. Call `toArray()` when you need a plain array you own.

```js
// Allocates nothing per frame
for (const entity of world.query()) {
}

// Copies, so only do this when the list has to outlive the frame
const kept = world.query().toArray()
```
