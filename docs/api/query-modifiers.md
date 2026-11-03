---
title: Query Modifiers
description: Using modifiers with queries
nav: 6
---

Modifiers are used to filter query results enabling powerful patterns. All modifiers can be mixed together.

## Not

The `Not` modifier excludes entities that have specific traits from the query results.

```js
import { Not } from 'koota'

const staticEntities = world.query(Position, Not(Velocity))
```

## Or

By default all query parameters are combined with logical AND. The `Or` modifier enables using logical OR instead.

```js
import { Or } from 'koota'

const movingOrVisible = world.query(Or(Velocity, Renderable))
```

Tracking modifiers report what happened since the query last ran. The world records its own history, so a tracking query created at any time, including inside a system body, sees earlier events on its first run. Entities that hold a trait count as added, entities that lost a trait and have not regained it count as removed, and entities whose trait was written since they spawned count as changed. Write history is recorded once a `Changed` term names the trait, so create `Changed` terms at module scope to record writes from the start. A destroyed entity keeps its data until its id is reused, so a reader created after the destroy still sees it, see [Destroyed entities](#destroyed-entities).

## Added

The `Added` modifier tracks all entities that have added the specified traits or relations since the last time the query was run. A new instance of the modifier must be created for tracking to be unique.

When multiple traits are passed to `Added` it uses logical `AND`. Only entities where **all** specified traits have been added will be returned.

```js
import { createAdded } from 'koota'

const Added = createAdded()

// Track entities that added the Position trait
const newPositions = world.query(Added(Position))

// Track entities that added a ChildOf relation
const newChildren = world.query(Added(ChildOf))

// Track entities where BOTH Position AND Velocity were added
const fullyAdded = world.query(Added(Position, Velocity))

// Track entities where EITHER Position OR Velocity was added
const eitherAdded = world.query(Or(Added(Position), Added(Velocity)))

// After running the query, the Added modifier is reset
```

## Removed

The `Removed` modifier tracks all entities that have removed the specified traits or relations since the last time the query was run. This includes entities destroyed while holding them, so one reader covers a trait leaving a live entity and an entity ending, see [Destroyed entities](#destroyed-entities). The value a removed trait had stays readable with `get` until the trait is added back or the id is reused, so the reader can process what left, and the other terms of the query match a destroyed entity on the traits it died with. A trait with a custom `remove` accessor keeps only what the accessor leaves. A new instance of the modifier must be created for tracking to be unique.

When multiple traits are passed to `Removed` it uses logical `AND`. Only entities where **all** specified traits have been removed will be returned.

```js
import { createRemoved } from 'koota'

const Removed = createRemoved()

// Track entities that removed the Velocity trait
const stoppedEntities = world.query(Removed(Velocity))

// Track entities that removed a ChildOf relation
const orphaned = world.query(Removed(ChildOf))

// Track entities where BOTH Position AND Velocity were removed
const fullyRemoved = world.query(Removed(Position, Velocity))

// Track entities where EITHER Position OR Velocity was removed
const eitherRemoved = world.query(Or(Removed(Position), Removed(Velocity)))

// After running the query, the Removed modifier is reset
```

## Changed

The `Changed` modifier tracks all entities that have had the specified traits or relation stores change since the last time the query was run. A new instance of the modifier must be created for tracking to be unique.

When multiple traits are passed to `Changed` it uses logical `AND`. Only entities where **all** specified traits have changed will be returned.

```js
import { createChanged } from 'koota'

const Changed = createChanged()

// Track entities whose Position has changed
const movedEntities = world.query(Changed(Position))

// Track entities whose ChildOf relation data has changed
const updatedChildren = world.query(Changed(ChildOf))

// Track entities where BOTH Position AND Velocity have changed
const fullyUpdated = world.query(Changed(Position, Velocity))

// Track entities where EITHER Position OR Velocity has changed
const eitherChanged = world.query(Or(Changed(Position), Changed(Velocity)))

// After running the query, the Changed modifier is reset
```

Tracking modifiers do not accept relation pairs directly such as `Changed(ChildOf(parent))`. Pass the base relation to the modifier and add a separate relation filter parameter. Relation filters can use any legal query, not just a single trait.

```js
const parent = world.spawn()

const changedChildren = world.query(Changed(ChildOf), ChildOf(parent))
const changedPlayerChildren = world.query(Changed(ChildOf), ChildOf(IsPlayer, IsActive))
```

## Destroyed entities

A destroyed entity keeps its id and its data until the world reuses the id for a new entity, and every trait it held when it died counts as removed. A `Removed` query over one of those traits sees the entity in destroy order, `has` and `get` answer for the traits it held when it died, other query terms filter on them, and `isAlive` tells a destroy apart from a trait leaving a live entity. A trait removed before the destroy was a remove, not part of the destroy.

A spawn reuses an id only after at least `retain` newer destroys, 1024 by default and set with `createWorld({ retain })`, and after every `Removed` query has run twice since the destroy, once to expose it and once to move past it, up to sixteen times `retain` for a reader that has stopped running. Until then spawns take fresh ids. Zero reuses ids at once. A destroyed entity is dead for every other purpose. It is not alive, it is in no other query, writes to it throw, and `world.entities` does not list it.

```js
const Removed = createRemoved()

function cleanupSystem(world) {
  world.query(Removed(ServerSync)).each((serverSync) => {
    serverSync.disconnect()
  })
}

// Caught by Removed(ServerSync) with its data intact until the cleanup system has read it
entity.destroy()

// Caught as well, from an entity that stays alive
entity.remove(ServerSync)
```

Because the world keeps the history, the cleanup system does not have to exist before the first destroy. A `Removed` query created later still sees every destroyed entity whose id has not been reused, in destroy order.

A destroyed entity keeps its relations as well. `targetFor`, `targetsFor`, `has` and `get` read the targets and pair data it held when it died, and a pair term filters a `Removed` query on them. Children destroyed with their parent through `autoDestroy` keep the parent as their target. A live entity that drops a pair or whose target dies loses it as before, so a pair term matches only the destroyed ones.

```js
const RemovedChild = createRemoved()

// Children destroyed while attached to the parent, with it or on their own
world.query(RemovedChild(ChildOf), ChildOf(parent)).forEach((child) => {
  detach(child, child.targetFor(ChildOf))
})
```

## Add, remove and change events

Koota allows you to subscribe to add, remove, and change events for specific traits.

- `onAdd` triggers when `entity.add()` is called after the initial value has been set on the trait.
- `onRemove` triggers when `entity.remove()` is called, but before any data has been removed.
- `onChange` triggers when an entity's trait value has been set with `entity.set()` or when it is manually flagged with `entity.changed()`.

```js
// Subscribe to Position changes
const unsub = world.onChange(Position, (entity) => {
  console.log(`Entity ${entity} changed position`)
})

// Subscribe to Position additions
const unsub = world.onAdd(Position, (entity) => {
  console.log(`Entity ${entity} added position`)
})

// Subscribe to Position removals
const unsub = world.onRemove(Position, (entity) => {
  console.log(`Entity ${entity} removed position`)
})

// Trigger events
const entity = world.spawn(Position)
entity.set(Position, { x: 10, y: 20 })
entity.remove(Position)
```

When subscribing to relations, callbacks receive `(entity, target)` so you know which relation pair changed. Relation `onChange` events are triggered by `entity.set(Relation(target), data)` and only on relations with data via the store prop.

```js
const Likes = relation()

const unsub = world.onAdd(Likes, (entity, target) => {
  console.log(`Entity ${entity} likes ${target}`)
})
```
