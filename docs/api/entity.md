---
title: Entity
description: Entity API
nav: 3
---

An entity is a number encoded with a world, generation and ID. Every entity is unique even if they have the same ID since they will have different generations. This makes automatic-recycling possible without reference errors. Because of this, the number of an entity won't give you its ID but will have to instead be decoded with `entity.id()`.

```js
// Add a trait to the entity
entity.add(Position)

// Remove a trait from the entity
entity.remove(Position)

// Checks if the entity has the trait
// Return boolean
const result = entity.has(Position)

// Gets the trait record for an entity
// Return TraitRecord
const position = entity.get(Position)
// Fills a record you own instead of allocating one
// Return the record, or undefined if the entity does not have the trait
entity.get(Position, position)

// Sets the trait and triggers a change event
// With assertions enabled, throws if the entity does not have the trait
entity.set(Position, { x: 10, y: 10 })
// Can take a callback with the previous state passed in
entity.set(Position, (prev) => ({
  x: prev + 1,
  y: prev + 1,
}))

// Get the targets for a relation
// Return Entity[]
const targets = entity.targetsFor(Contains)

// Get the first target for a relation
// Return Entity
const target = entity.targetFor(Contains)

// Get the entity ID
// Return number
const id = entity.id()

// Get the entity generation
// Return number
const generation = entity.generation()

// Get the entity's name if it has the Name trait
// Return string | undefined
const name = entity.name()

// Destroys the entity making its number no longer valid
entity.destroy()
```

For introspection, `unpackEntity` can be used to get all of the encoded values. This can be useful for debugging.

```js
const { entityId, generation, worldId } = unpackEntity(entity)
```

See [assertion configuration](asserts.md) for development checks and production overrides.

## Named entities

The built-in `Name` trait gives an entity a unique name within its world. `Name('player')` works in `spawn`, `add`, `has` and `query`, and `world.lookup` resolves a name through an index.

```js
import { Name } from 'koota'

const player = world.spawn(Name('player'), Position)

world.lookup('player') // player
player.name() // 'player'
player.has(Name('player')) // true

// Rename through set or updateEach
player.set(Name, { value: 'hero' })

// Name filters compose with other query parameters
world.query(Name('hero'), Position)
```

Names are unique per world. Taking a name another entity holds throws. The name is freed when the trait is removed or the entity is destroyed. Names can also be changed through `world.query(Name).updateEach`, which keeps the index current. Reading the `Name` column through `getPages()` is safe. Writing it there bypasses the index and query updates, so rename through `set` or `updateEach` instead. Name filters work in `world.query`, `world.queryFirst`, cached queries and query subscriptions. Cached queries follow the current owner of the name in each world. Subscriptions react to renaming, destruction and changes to the other queried traits.

Names are non-empty strings. Each world stores a Map from name to entity, with no global name registry. Look up an entity by name when needed, or cache the entity itself for repeated access.
