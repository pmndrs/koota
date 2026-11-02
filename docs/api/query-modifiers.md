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

Tracking modifiers report what happened since the query last ran. The world records its own history, so a tracking query created at any time, including inside a system body, sees earlier events on its first run. Entities that hold a trait count as added, entities that lost a trait and have not regained it count as removed, and entities whose trait was written since they spawned count as changed. Write history is recorded once a `Changed` term names the trait, so create `Changed` terms at module scope to record writes from the start. A destroyed entity keeps its data until its id is reused, so a reader created after the destroy still sees it, see [Destroyed](#destroyed).

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

The `Removed` modifier tracks all entities that have removed the specified traits or relations since the last time the query was run. This includes entities that have been destroyed, whose data stays readable until their id is reused, see [Destroyed](#destroyed). A new instance of the modifier must be created for tracking to be unique.

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

## Destroyed

The `Destroyed` modifier tracks entities destroyed while holding the specified traits since the last time the query was run. Removing a trait before the destroy does not count. The entity stays readable inside the query, so cleanup can still read its data, and other query terms filter on the traits it held when it died.

A destroyed entity keeps its id and its data until the world reuses the id for a new entity. A spawn reuses an id only after at least `retain` newer destroys, 1024 by default and set with `createWorld({ retain })`, and after every `Removed` and `Destroyed` query has run twice since the destroy, once to expose it and once to move past it, up to sixteen times `retain` for a reader that has stopped running. Until then spawns take fresh ids. Zero reuses ids at once. A destroyed entity is dead for every other purpose. It is not alive, it is in no other query, writes to it throw, and `world.entities` does not list it.

```js
import { createDestroyed } from 'koota'

const Destroyed = createDestroyed()

function cleanupSystem(world) {
  world.query(Destroyed(ServerSync)).readEach(([serverSync]) => {
    serverSync.disconnect()
  })
}

// Caught by Destroyed(ServerSync) with its data intact until the cleanup system has read it
entity.destroy()

// Ignored by Destroyed(ServerSync)
entity.remove(ServerSync)
```

Because the world keeps the history, the cleanup system does not have to exist before the first destroy. A `Removed` or `Destroyed` query created later still sees every destroyed entity whose id has not been reused, in destroy order.

# Events

An event is an entity that is spawned and destroyed in one call. `world.emit` does that, so synchronous subscribers see it at once and `Destroyed` queries drain it later. `createListener` returns a cached query key over a `Destroyed` term for the event trait, with any other query terms added, so each listener drains its own batch. An event lives until every listener has read it and at least `retain` newer destroys have happened, so listeners can run anywhere in the loop and can be created after the emit.

```js
import { createListener, trait } from 'koota'

const CoinCollected = trait({ by: 0 as Entity, coin: 0 as Entity })

// Emit an event, extra traits tag it for filtering
world.emit(CoinCollected({ by: player, coin }), IsHot)

// Returns a cached query key, create it at module scope
const coinCollected = createListener(CoinCollected, Or(IsHot, IsCold))

function eventSystem(world) {
  world.query(coinCollected).readEach(([event]) => {
    score(event.by)
  })
}
```

Use `world.spawn` instead when the event should persist and be destroyed by your own logic.

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
