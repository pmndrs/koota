---
title: First Steps
description: How to use Koota
nav: 1
---

## Define traits

Traits are the building blocks of your state. They represent slices of data with specific meanings.

```js
import { trait } from 'koota'

// Basic trait with default values
const Position = trait({ x: 0, y: 0 })
const Velocity = trait({ x: 0, y: 0 })

// Trait with a callback for initial value
// ⚠️ Must be an object
const Mesh = trait(() => new THREE.Mesh())

// Tag trait (no data)
const IsActive = trait()
```

## Spawn entities

Entities are spawned in a world. By adding traits to an entity they gain content.

```js
import { createWorld } from 'koota'

const world = createWorld()

const player = world.spawn(Position, Velocity)
// Initial values can be passed in to the trait by using it as a function
const goblin = world.spawn(Position({ x: 10, y: 10 }), Velocity, Mesh)
```

## Query and update data

Queries fetch entities sharing traits (archetypes). Use them to batch update entities efficiently.

```js
// updateEach mutates and writes back to stores
// Run this in a loop
world.query(Position, Velocity).updateEach(([position, velocity]) => {
  position.x += velocity.x * delta
  position.y += velocity.y * delta
})

// For read-only operations with no mutation, use readEach
const data = []
world.query(Position, Velocity).readEach(([position, velocity]) => {
  data.push({ x: position.x, y: position.y })
})
```

`updateEach` and `readEach` pass the entity as the second argument and its position in the visit order as the third. SoA records (traits defined with a schema object) are scratch objects reused for every entity, so use them inside the callback and copy what you want to keep. AoS records (traits defined with a factory function) are the stored objects themselves, so changes to them persist even in `readEach`. Treat `readEach` records as read-only. `updateEach` stores the fields you changed when the callback returns, so a trait set with `entity.set` inside the callback is not overwritten. Replacing a record in the values array with a new object, as in `values[0] = { x: 1, y: 2 }`, stores the new record's fields the same way. Adding or removing traits or entities from inside the callback works, and the rest of the loop then runs on a slower path.
