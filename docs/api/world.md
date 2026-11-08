---
title: World
description: World API
nav: 2
---

The `World` is where all data is stored. We have methods on entities but this is a bit of a trick, entities don't actually store any data and instead it is operating on the connected world. Each world has its own set of entities that do not overlap with another. Typically you only need one world.

World's can also have their own traits, which function as singletons.

- [World API](#World-API)
- [World Traits](#World-Traits)

## World API

`createWorld(options?: WorldOptions)` sets policy at creation. Add singleton traits afterward with `world.add(...)`. The `retain` option must be a non-negative safe integer.

```js
// Set world policy once. Options are optional and retain defaults to 1024
const world = createWorld({ retain: 1024 })
world.add(Time, Config)

// Read-only cap on retained destroyed entities, preserved by reset
// Overflow evicts the oldest, even if unread. Zero disables destroyed-entity retention
world.retain

// Spawns an entity
// Can pass any number of traits
// Return Entity
const entity = world.spawn()

// Spawn always creates an entity then adds each trait in order
// A taken exclusive identifier key is refused, so look up first to find or create
const Name = identifier()
const player = world.lookup(Name('player')) ?? world.spawn(Name('player'), Position)

// Checks if the world has the entity
// Return boolean
const result = world.has(entity)

// Get all entities that match the query parameters
// Returns a QueryView, a live view over the matching entities
const entities = world.query(Position)

// Relation filters can use any legal query
const rareInventories = world.query(Contains(IsRare))

// Return the first entity that matches the query
// Return Entity
const entity = world.queryFirst(Position)

// Get one entity with an identifier term
// Return Entity | undefined
const player = world.lookup(Name('player'))

// Get every entity sharing an identifier value
// Return Entity[] snapshot, including excluded entities
const DisplayName = identifier({ exclusive: false })
const players = world.lookupAll(DisplayName('kris'))

// Subscribe to add, remove or change events for entity traits
// Return unsub function
const unsub = world.onAdd(Position, (entity) => {})
const unsub = world.onRemove(Position, (entity) => {})
const unsub = world.onChange(Position, (entity) => {})

// Hooks also accept relation pairs for target-specific filtering
const unsub = world.onAdd(ChildOf(parent), (entity, target) => {})
const unsub = world.onAdd(ChildOf('*'), (entity, target) => {})

// Subscribe to entities entering or exiting a query
// Entry starts matching, exit stops matching
// Return unsub function
const unsub = world.onEnter([Position, Velocity], (entity) => {})
const unsub = world.onExit([Position, Velocity], (entity) => {})

// Relation-filtered query subscriptions stay live as target membership changes
const unsub = world.onEnter([ChildOf(IsPlayer, IsActive)], (entity) => {})

// An array of all entities alive in the world, including non-queryable entities
// This is a copy so editing it won't do anything!
// Entity[]
world.entities

// Returns the world's unique ID
// Return number
const id = world.id()

// Resets the world as if it were just created
// The world ID and reference is preserved
world.reset()

// Nukes the world and releases its ID
world.destroy()
```

See [query lifecycle](query.md#query-lifecycle) for membership semantics and examples.

## World traits

Worlds can have traits, which is our version of a singleton. Use these for global resources like a clock.

Under the hood, each world gets its own entity tied to these world traits. **This world entity is not queryable but will show up in the list of active entities**.

To access a world trait instead of using queries you must access the world directly. Note these methods mirror the [Entity API](/api/entity).

```js
// Add a trait to the world
const Time = trait({ delta: 0, current: 0 })
world.add(Time)

// Check if the world has a trait
// Return boolean
const result = world.has(Time)

// Returns the trait record for the world
// Return TraitRecord
const time = world.get(Time)

// Sets the trait and triggers a change event
world.set(Time, { current: performance.now() })
// Can take a callback with the previous state passed in
world.set(Time, (prev) => ({
  current: performance.now(),
  delta: performance.now() - prev.current,
}))

// Sets the value if the world has the trait, or adds the trait with the value if it does not
world.upsert(Time, { current: performance.now() })

// Remove a trait from the world
world.remove(Time)
```
