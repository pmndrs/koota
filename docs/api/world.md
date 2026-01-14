---
title: World
description: World API
nav: 7
---

The `World` is where all data is stored. We have methods on entities but this is a bit of a trick, entities don't actually store any data and instead it is operating on the connected world. Each world has its own set of entities that do not overlap with another. Typically you only need one world.

World's can also have their own traits, which function as singletons. 

- [World API](#World%20API)
- [World Traits](#World%20Traits)

## World API

```js
// Spawns an entity
// Can pass any number of traits
// Return Entity
const entity = world.spawn()

// Checks if the world has the entity
// Return boolean
const result = world.has(entity)

// Get all entities that match the query parameters
// Return QueryResult (which is Entity[] with extras)
const entities = world.query(Position)

// Return the first entity that matches the query
// Return Entity
const entity = world.queryFirst(Position)

// Subscribe to add, remove or change events for entity traits
// Return unsub function
const unsub = world.onAdd(Position, (entity) => {})
const unsub = world.onRemove(Position, (entity) => {})
const unsub = world.onChange(Position, (entity) => {})

// Subscribe to add or remove query events
// This triggers whenever a query is updated
// Return unsub function
const unsub = world.onQueryAdd([Position, Velocity], (entity) => {})
const unsub = world.onQueryRemove([Position, Velocity], (entity) => {})

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


## World traits

Worlds can have traits, which is our version of a singleton. Use these for global resources like a clock. 

Under the hood, each world gets its own entity tied to these world traits. **This world entity is not queryable but will show up in the list of active entities**. 

To access a world trait instead of using queries you must access the world directly. Note these methods mirror the Entity API. 


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

// Remove a trait from the world
world.remove(Time)
```