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

Tracking modifiers report changes since their query last ran. `Added` and `Changed` start with current matches. `Removed` starts with retained removals, including [destroyed entities](#destroyed-entities) that have not been evicted.

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

The `Removed` modifier tracks entities that removed the specified traits or relations since the last query, including [destroyed entities](#destroyed-entities). Read retained values through `each` arguments or `getPages` stores until the trait is added back or the entity is evicted. A custom `remove` accessor may clear retained data. Ordinary entity methods require a live entity, and `get` returns `undefined` for a removed trait on a live entity. A new instance of the modifier must be created for tracking to be unique.

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

`Changed` tracks additions and writes to the specified traits or relation stores. Its first run includes all current matches. Create a separate modifier for each independent reader.

When multiple traits are passed to `Changed` it uses logical `AND`. Only entities where **all** specified traits have changed will be returned.

```js
import { createChanged } from 'koota'

const Changed = createChanged()
const entity = world.spawn(Position)

// First run includes existing Position traits
world.query(Changed(Position))

entity.set(Position, { x: 10 })
// Later runs include additions and writes
const movedEntities = world.query(Changed(Position))

// Track ChildOf additions and data writes
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

A destroyed entity keeps its id and data until eviction, and every trait it held when it died counts as removed. `Removed` queries expose retained values through `each` and `getPages`. Ordinary `get`, `has`, `targetFor` and `targetsFor` require a live entity, even inside those loops. Other query terms match the traits and pairs held at destruction. `isAlive` distinguishes a destroy from a live removal.

The world keeps its newest `retain` destroyed entities, 1024 by default and fixed at creation with `createWorld({ retain })`. Each destroy that exceeds the cap evicts the oldest entity, even if a reader has not consumed it. Eviction invalidates its handle, removes it from pending and exposed query batches, releases its stored values and relations, and makes its id reusable. The cap is enforced during destroy, without waiting for another spawn. Slow readers can miss evicted entities.

Readers consume their batches independently within the cap. Running a query exposes its pending batch and the next run replaces it. Reading does not evict world history, so late queries can still seed from the retained entities. Zero disables destroyed-entity retention, while removals from live entities still work. A destroyed entity is dead for every other purpose. It is not alive, it is in no other query, writes to it throw, and `world.entities` does not list it.

The cap bounds the number of retained destroyed entities, not their size in bytes. Allocated storage pages remain available for reuse. Mutations that overflow the cap also invalidate evicted entries in existing query views and caller-owned snapshots.

```js
const destroyed = world.spawn(ServerSync)
const live = world.spawn(ServerSync)
destroyed.destroy()
live.remove(ServerSync)

// Both values are available when the query is registered afterward
const Removed = createRemoved()
world.query(Removed(ServerSync)).each((serverSync) => {
  serverSync.disconnect()
})
```

Queries registered after removal can read retained values until re-addition or eviction. Late readers receive retained destroyed entities in destroy order. For a custom page loop:

```js
const RemovedPosition = createRemoved()
for (const {
  stores: [position],
  indices,
  entities,
} of world.query(RemovedPosition(Position)).getPages()) {
  for (let i = 0; i < indices.length; i++) {
    const offset = indices[i]
    recordRemoval(entities[i], position.x[offset], position.y[offset])
  }
}
```

Finish page reads before structural mutations that may evict or reuse their rows.

Retained relation pairs still match query filters. Children destroyed with their parent through `autoDestroy` keep that parent for matching. Ordinary relation readers require a live entity. A live entity that drops a pair or whose target dies loses the pair as before.

```js
const RemovedChild = createRemoved()

// Children destroyed while attached to the parent, with it or on their own
world.query(RemovedChild(ChildOf), ChildOf(parent)).forEach((child) => {
  detach(child, parent)
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
