---
title: Hooks
description: React Hooks API
nav: 9
---

Use the provided hooks for reactive updates.

## `useQuery`

Reactively updates when entities matching the query changes. Returns a `QueryResult`, which is like an array of entities.

```js
// Get all entities with Position and Velocity traits
const entities = useQuery(Position, Velocity)

// Render a view
return (
  <>
    {entities.map((entity) => (
      <View key={entity.id()} entity={entity} />
    ))}
  </>
)
```

## `useQueryFirst`

Works like `useQuery` but only returns the first result. Can either be an entity of undefined.

```js
// Get the first entity with Player and Position traits
const player = useQueryFirst(Player, Position)

// Render a view if an entity is found
return player ? <View entity={player} /> : null
```

## `useWorld`

Returns the world held in context via `WorldProvider`.

```js
// Get the default world
const world = useWorld();

// Use the world to create an entity on mount
useEffect(() => {
    const entity = world.spawn()
    return => entity.destroy()
}, [])

```

## `WorldProvider`

The provider for the world context. A world must be created and passed in.

```js
// Create a world and pass it to the provider
const world = createWorld()

// All hooks will now use this world instead of the default
function App() {
  return (
    <WorldProvider world={world}>
      <Game />
    </WorldProvider>
  )
}
```

## `useTrait`

Observes an entity, or world, for a given trait and reactively updates when it is added, removed or changes value. The returned trait snapshot maybe `undefined` if the trait is no longer on the target. This can be used to conditionally render.

```js
// Get the position trait from an entity and reactively updates when it changes
const position = useTrait(entity, Position)

// If position is removed from entity then it will be undefined
if (!position) return null

// Render the position
return (
  <div>
    Position: {position.x}, {position.y}
  </div>
)
```

The entity passed into `useTrait` can be `undefined` or `null`. This helps with situations where `useTrait` is combined with queries in the same component since hooks cannot be conditionally called. However, this means that result can be `undefined` if the trait is not on the entity or if the target is itself `undefined`. In most cases the distinction will not matter, but if it does you can disambiguate by testing the target.

```js
// The entity may be undefined if there is no valid result
const entity = useQueryFirst(Position, Velocity)
// useTrait handles this by returned undefined if the target passed in does not exist
const position = useTrait(entity, Position)

// However, undefined here can mean no entity or no component on entity
// To make the outcome no longer ambiguous you have to test the entity
if (!entity) return <div>No entity found!</div>

// Now this is narrowed to Position no longer being on the component
if (!position) return null

return (
  <div>
    Position: {position.x}, {position.y}
  </div>
)
```

## `useTag`

Observes an entity, or world, for a tag and reactively updates when it is added or removed. Returns `true` when the tag is present or `false` when absent. Use this instead of `useTrait` for tags. For tracking the presence of non-tag traits, use `useHas`.

```js
const IsActive = trait()

function ActiveIndicator({ entity }) {
  // Returns true if the entity has the tag, false otherwise
  const isActive = useTag(entity, IsActive)

  if (!isActive) return null

  return <div>🟢 Active</div>
}
```

## `useHas`

Observes an entity, or world, for any trait and reactively updates when it is added or removed. Returns `true` when the trait is present or `false` when absent. Unlike `useTrait`, this only tracks presence and not the trait's value.

```js
const Health = trait({ amount: 100 })

function HealthIndicator({ entity }) {
  // Returns true if the entity has the trait, false otherwise
  const hasHealth = useHas(entity, Health)

  if (!hasHealth) return null

  return <div>❤️ Has Health</div>
}
```

## `useTraitEffect`

Subscribes a callback to a trait on an entity. This callback fires as an effect whenever it is added, removed or changes value without rerendering.

```js
// Subscribe to position changes on an entity and update a ref without causing a rerender
useTraitEffect(entity, Position, (position) => {
  if (!position) return
  meshRef.current.position.copy(position)
})

// Subscribe to world-level traits
useTraitEffect(world, GameState, (state) => {
  if (!state) return
  console.log('Game state changed:', state)
})
```

## `useTarget`

Observes an entity, or world, for a relation and reactively returns the first target entity. Returns `undefined` if no target exists.

```js
const ChildOf = relation()

function ParentDisplay({ entity }) {
  // Returns the first target of the ChildOf relation
  const parent = useTarget(entity, ChildOf)

  if (!parent) return <div>No parent</div>

  return <div>Parent: {parent.id()}</div>
}
```

## `useTargets`

Observes an entity, or world, for a relation and reactively returns all target entities as an array. Returns an empty array if no targets exist.

```js
const Contains = relation()

function InventoryDisplay({ entity }) {
  // Returns all targets of the Contains relation
  const items = useTargets(entity, Contains)

  return (
    <ul>
      {items.map((item) => (
        <li key={item.id()}>Item {item.id()}</li>
      ))}
    </ul>
  )
}
```

## `useActions`

Returns actions bound to the world that is in context. Use actions created by `createActions`.

```js
// Create actions
const actions = createActions((world) => ({
    spawnPlayer: () => world.spawn(IsPlayer).
    destroyAllPlayers: () => {
        world.query(IsPlayer).forEach((player) => {
            player.destroy()
        })
    }
}))

// Get actions bound to the world in context
const { spawnPlayer, destroyAllPlayers } = useActions();

// Call actions to modify the world in an effect or handlers
useEffect(() => {
    spawnPlayer()
    return () => destroyAllPlayers()
}, [])
```