---
title: API
description: React integration API
nav: 9
---

Import React hooks and components from `koota/react`. Every hook reads a world from context, including hooks whose target is a `World`, so render them under a `WorldProvider`.

The examples below assume application traits such as `Position`, `Velocity`, and `IsPlayer`, and relations such as `ChildOf` and `Contains`, are defined in framework-agnostic modules.

## `WorldProvider`

Provides a world to descendant components. Create the world outside the component tree so it remains stable across renders.

```jsx
import { createWorld } from 'koota'
import { WorldProvider } from 'koota/react'

const world = createWorld()

export function App() {
  return (
    <WorldProvider world={world}>
      <Game />
    </WorldProvider>
  )
}
```

## `useWorld`

Returns the world from the nearest `WorldProvider`. It throws if no world has been provided.

```jsx
import { useEffect } from 'react'
import { useWorld } from 'koota/react'

function SpawnOnMount() {
  const world = useWorld()

  useEffect(() => {
    const entity = world.spawn()
    return () => entity.destroy()
  }, [world])

  return null
}
```

## `useQuery`

Returns an array of the entities that match the query, sorted by id. The component rerenders when entities enter or leave the query, and the array is replaced only then. To read or update trait data in bulk, run `world.query` inside an effect or frame callback instead.

```jsx
import { useQuery } from 'koota/react'

function RocketList() {
  const rockets = useQuery(Position, Velocity)

  return rockets.map((entity) => <RocketView key={entity} entity={entity} />)
}
```

## `useQueryFirst`

Works like `useQuery`, but returns only the first matching entity or `undefined`.

```jsx
import { useQueryFirst } from 'koota/react'

function PlayerView() {
  const player = useQueryFirst(IsPlayer, Position)
  return player ? <View entity={player} /> : null
}
```

## `useTrait`

Observes a trait on an entity or world. It returns the current trait record and rerenders when the trait is added, removed, or changed. The result is `undefined` when the target is nullish or does not have the trait.

Requires a `WorldProvider`. The target must belong to the world returned by `useWorld()`.

Relation pairs are supported for relations with store data. Tags and relations without a store have no record, so the result is always `undefined`. Use `useTag` or `useHas` to observe presence.

For an ordered relation trait, `useTrait(parent, OrderedChildren)` returns a `readonly Entity[]` in relation order. The hook reuses the array while the sequence is the same. Add, remove, or reorder children through `parent.get(OrderedChildren)` in an action or event handler.

```jsx
import { useTrait } from 'koota/react'

function PositionView({ entity, parent }) {
  const position = useTrait(entity, Position)
  const childData = useTrait(entity, ChildOf(parent))

  if (!position) return null
  return (
    <div>
      Position: {position.x}, {position.y}
    </div>
  )
}
```

A nullish target is useful when combining `useTrait` with `useQueryFirst` without calling hooks conditionally:

```jsx
const entity = useQueryFirst(Position, Velocity)
const position = useTrait(entity, Position)

if (!entity) return <div>No matching entity</div>
if (!position) return <div>The entity no longer has Position</div>

return (
  <div>
    Position: {position.x}, {position.y}
  </div>
)
```

## `useTag`

Observes a tag on an entity or world. It returns `true` when the tag is present and `false` when it is absent or the target is nullish. Use `useHas` to observe the presence of data-bearing traits.

```jsx
import { useTag } from 'koota/react'

function ActiveIndicator({ entity }) {
  const isActive = useTag(entity, IsActive)
  return isActive ? <div>Active</div> : null
}
```

## `useHas`

Observes a trait, relation pair, identifier type or identifier term on an entity or world. It returns `false` when absent or the source is nullish. Changes to trait data do not affect it.

```jsx
import { useHas } from 'koota/react'

function Status({ entity, parent }) {
  const hasHealth = useHas(entity, Health)
  const isChildOfParent = useHas(entity, ChildOf(parent))
  const hasAnyParent = useHas(entity, ChildOf('*'))

  return hasHealth ? <div>Has health</div> : null
}
```

For identifiers, pass the type to observe presence or a term to observe an exact key. Replacing a key keeps presence true and updates the matching terms. Inline terms do not need memoization.

```ts
const hasWireId = useHas(entity, WireId)
const isPlayer = useHas(entity, WireId(123))
```

## `useMachine`

Returns the current member of a [state machine](../api/machines.md), or `undefined` when absent. Updates on entry, self-entry, removal and destruction. Accepts an entity, a world singleton, `null` or `undefined`.

```jsx
import { useMachine } from 'koota/react'

function AssetStatus({ entity }) {
  const state = useMachine(entity, AssetMachine)

  if (state === Pending) return <span>Pending</span>
  if (state === Loading) return <span>Loading</span>
  if (state === Loaded) return <span>Loaded</span>
  return <span>No asset loading state</span>
}
```

## `useTraitEffect`

Runs a callback with the current trait value when the effect starts and again whenever the trait is added, removed, or changed. A missing or removed trait produces `undefined`. Use it to synchronize imperative objects without rerendering the component for each change.

Unlike `useTrait`, the target must be an entity or world; it cannot be `null` or `undefined`.

```jsx
import { useTraitEffect } from 'koota/react'

function SyncTraits({ entity, parent, world, meshRef }) {
  useTraitEffect(entity, Position, (position) => {
    if (position) meshRef.current.position.copy(position)
  })

  useTraitEffect(entity, ChildOf(parent), (data) => {
    console.log('ChildOf data:', data)
  })

  useTraitEffect(world, GameState, (state) => {
    console.log('Game state:', state)
  })

  return null
}
```

## `useTarget`

Observes a relation or identifier on an entity or world. It returns the first target entity for a relation or the scalar key for an identifier. The result is `undefined` when no target exists or the source is nullish or destroyed.

```jsx
import { useTarget } from 'koota/react'

function ParentDisplay({ entity }) {
  const parent = useTarget(entity, ChildOf)
  return parent ? <div>Parent: {parent.id()}</div> : <div>No parent</div>
}
```

Identifier keys retain their inferred type. The hook follows assignment, replacement and removal, and world targets remain subscribed across resets.

```ts
import { identifier } from 'koota'

const Name = identifier()
const WireId = identifier<number>()

function PlayerLabel({ entity }) {
  const name = useTarget(entity, Name) // string | undefined
  const wireId = useTarget(entity, WireId) // number | undefined
  // ...
}
```

Use `useQueryFirst(WireId(123))` for the reverse direction, observing the entity that owns a key. The returned entity can be passed directly to `useTarget` or `useHas`.

## `useTargets`

Observes a relation on an entity or world. It returns all target entities and returns an empty array when none exist or the source target is nullish.

```jsx
import { useTargets } from 'koota/react'

function Inventory({ entity }) {
  const items = useTargets(entity, Contains)

  return (
    <ul>
      {items.map((item) => (
        <li key={item}>Item {item.id()}</li>
      ))}
    </ul>
  )
}
```

## `useActions`

Calls an action initializer with the world from context and returns the bound actions. Use it with actions created by `createActions`.

```jsx
import { createActions } from 'koota'
import { useActions } from 'koota/react'

const playerActions = createActions((world) => ({
  spawnPlayer: () => world.spawn(IsPlayer),
  destroyAllPlayers: () => {
    for (const player of world.query(IsPlayer)) player.destroy()
  },
}))

function PlayerControls() {
  const { spawnPlayer, destroyAllPlayers } = useActions(playerActions)

  return (
    <>
      <button onClick={spawnPlayer}>Spawn player</button>
      <button onClick={destroyAllPlayers}>Destroy all players</button>
    </>
  )
}
```
