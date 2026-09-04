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

Returns a `QueryResult` containing entities that match the query. The component rerenders when entities enter or leave the result.

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

Relation pairs are supported for relations with store data.

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

Observes the presence of any trait or relation pair on an entity or world. It returns a boolean; changes to a trait's value do not affect it.

```jsx
import { useHas } from 'koota/react'

function Status({ entity, parent }) {
  const hasHealth = useHas(entity, Health)
  const isChildOfParent = useHas(entity, ChildOf(parent))
  const hasAnyParent = useHas(entity, ChildOf('*'))

  return hasHealth ? <div>Has health</div> : null
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

Observes a relation on an entity or world. It returns the first target entity, or `undefined` when no target exists or the source target is nullish.

```jsx
import { useTarget } from 'koota/react'

function ParentDisplay({ entity }) {
  const parent = useTarget(entity, ChildOf)
  return parent ? <div>Parent: {parent.id()}</div> : <div>No parent</div>
}
```

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
    world.query(IsPlayer).forEach((player) => player.destroy())
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
