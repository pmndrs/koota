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
// Run this in a loop
world.query(Position, Velocity).updateEach(([position, velocity]) => {
  position.x += velocity.x * delta
  position.y += velocity.y * delta
})
```