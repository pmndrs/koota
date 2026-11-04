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

An inline callback is created each time `each` is called, then reused for the entities in that walk. Define it once if the same function can be shared across calls.

```js
// Create the function once
const handleMove = (position, velocity) => {}

function updateMovement(world) {
  // Use it for each
  world.query(Position, Velocity).each(handleMove)
}
```

### Iterating entity handles

A query returns a cached live view over its entities. Use `for...of` on the view to keep the starting membership while adding or removing entities or traits. Each walk creates a cursor and reuses its result object for every entity.

```js
for (const entity of world.query(Position)) {
  if (entity.has(IsDead)) entity.destroy()
}
```

Read `query.entities` once to borrow the backing array without copying. Both indexed loops and `for...of` on this array use native array traversal.

```js
const query = world.query(Position)
const entities = query.entities

for (let i = 0, length = entities.length; i < length; i++) {
  draw(entities[i])
}
```

Treat the array as read-only. Finish the loop before running another query or changing membership. Use `toArray()` for an independent copy.

[Ordered views](../api/query.md#ordered-views) also expose `sorted.entities`. Reading it refreshes the order when needed, then returns the cached array. Read it once and finish the loop before another view access or changes to membership or sort data.
