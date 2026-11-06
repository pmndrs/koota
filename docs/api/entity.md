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
// Fills a record you own instead of allocating one, such as one from Position.record()
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

// Sets the value if the entity has the trait, or adds the trait with the value if it does not
// Triggers a change event, and an add event when the trait is new
entity.upsert(Position, { x: 10 })

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

// Read an application-defined identifier
// Return its key type, or undefined
const key = entity.targetFor(WireId)

// Destroys the entity making its number no longer valid
entity.destroy()
```

For introspection, `unpackEntity` can be used to get all of the encoded values. This can be useful for debugging.

```js
const { entityId, generation, worldId } = unpackEntity(entity)
```

See [assertion configuration](asserts.md) for development checks and production overrides.

## Identifiers

Define the identifier types your application needs with `identifier()`. An entity can have one value for each type, and each value belongs to at most one entity per world.

```ts
import { identifier } from 'koota'

const Name = identifier()
const WireId = identifier<number>()
const player = world.spawn(Name('kris'), WireId(123), Position)

player.targetFor(Name) // 'kris'
player.targetsFor(WireId) // [123]
player.has(WireId(123)) // true
player.has(WireId) // true
player.add(WireId(456)) // Replaces 123
player.remove(WireId(123)) // No effect
player.remove(WireId) // Releases the current wire ID
```

Use `add` to replace a value and `targetFor` to read it. `get` and `set` operate on trait or relation data. Koota has no built-in `Name` or `entity.name()` method.

See [identifiers](identifiers.md) for lookup, queries, ownership and lifecycle contracts.
