---
title: Entity
description: Entity API
nav: 3
---

An entity is a number encoded with a generation and ID. Every entity is unique even if they have the same ID since they will have different generations. This makes automatic-recycling possible without reference errors. Because of this, the number of an entity won't give you its ID but will have to instead be decoded with `entity.id()`.

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
const { entityId, generation } = unpackEntity(entity)
```

See [assertion configuration](asserts.md) for development checks and production overrides.

## World-first calls

Every entity method has a world form that takes the entity first. Both do the same work, so use whichever reads better where you are. The world form needs no lookup from the entity to its world.

```js
world.add(entity, Position)
world.remove(entity, Position)
world.has(entity, Position)
world.get(entity, Position)
world.set(entity, Position, { x: 10, y: 10 })
world.upsert(entity, Position, { x: 10 })
world.changed(entity, Position)
world.targetFor(entity, Contains)
world.targetsFor(entity, Contains)
world.isAlive(entity)
world.destroy(entity)

// Hooks take the entity first to listen to that entity alone
world.onChange(entity, Position, (entity) => {})
```

## Isolated worlds

Entity methods are installed on `Number.prototype` when the first world is created, and worlds share one table that maps each entity to its world. That table holds a world until `world.destroy()` is called. When your code cannot touch globals, such as a library running inside someone else's app, or when a world should be garbage collected by dropping it, create your worlds from `koota/isolated` instead.

```js
import { trait } from 'koota'
import { createWorld } from 'koota/isolated'

const world = createWorld()
const entity = world.spawn(Position)

// An entity is a bare id, so the world does the work
world.get(entity, Position)
AssetMachine.enter(world, entity, Loaded)

// ❌ Entities have no methods, in the types or at runtime
entity.get(Position)
```

- An isolated world owns everything it allocates. Nothing global refers to it, so it is freed when you drop the last reference.
- Each isolated world numbers its entities from zero, so an entity only means something to the world that spawned it.
- Importing `koota/isolated` removes the methods from the `Entity` type across the whole program. Everything else is imported from `koota` as usual, and the React and Svelte bindings work unchanged.
- Create all of your worlds from `koota/isolated` or none of them. An entity method called on an entity of an isolated world is not caught, and reaches whichever world from `createWorld` holds that id.

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
