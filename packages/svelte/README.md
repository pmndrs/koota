# @koota/svelte

Svelte bindings for [Koota](https://github.com/pmndrs/koota) - an ECS-based state management library optimized for real-time apps, games, and XR experiences.

### Use in your Svelte components

Traits can be used reactively inside of Svelte components.

```svelte
<script>
  import { trait } from 'koota'
  import { provideWorld, useQuery, useTrait } from '@koota/svelte'

  const Position = trait({ x: 0, y: 0 })
  const Velocity = trait({ x: 0, y: 0 })

  // Create a world and provide it to child components via context
  const world = provideWorld()

  // Reactively update whenever the query updates with new entities
  const rockets = useQuery(() => [Position, Velocity])
</script>

{#each rockets.current as entity (entity)}
  <RocketView {entity} />
{/each}
```

```svelte
<!-- RocketView.svelte -->
<script>
  import { useWorld, useTrait } from '@koota/svelte'

  let { entity } = $props()

  // Observes this entity's position trait and reactively updates when it changes
  const position = useTrait(() => entity, Position)
</script>

{#if position.current}
  <div style:position="absolute" style:left="{position.current.x}px" style:top="{position.current.y}px">
    🚀
  </div>
{/if}
```

### Modify Koota state safely with actions

Use actions to safely modify Koota from inside of Svelte.

```svelte
<script>
  import { createActions } from 'koota'
  import { useActions } from '@koota/svelte'

  const actions = createActions((world) => ({
    spawnShip: (position) => world.spawn(Position(position), Velocity),
    destroyAllShips: () => {
      world.query(Position, Velocity).forEach((entity) => {
        entity.destroy()
      })
    },
  }))

  const { spawnShip, destroyAllShips } = useActions(actions)

  // Spawn three ships on mount, destroy on unmount
  $effect(() => {
    spawnShip({ x: 0, y: 1 })
    spawnShip({ x: 1, y: 0 })
    spawnShip({ x: 1, y: 1 })

    return () => destroyAllShips()
  })
</script>

<button onclick={destroyAllShips}>Boom!</button>
```

Or access world directly and use it.

```svelte
<script>
  import { useWorld } from '@koota/svelte'

  const world = useWorld()

  $effect(() => {
    const entity = world.spawn(Velocity, Position)
    return () => entity.destroy()
  })
</script>
```

### Reactive arguments

Most hooks accept a getter for the `target` parameter, which is always reactive — when the entity or world it returns changes, the hook re-subscribes automatically.

The second argument (trait, tag, or relation) can be passed as either a direct value or a getter. Direct values work for module-level constants, while getters enable reactivity for relation pairs with dynamic targets:

```svelte
<script>
  let { entity, parent } = $props()

  // Direct value — fine for static traits
  const position = useTrait(() => entity, Position)

  // Getter — reactive when parent changes
  const childData = useTrait(() => entity, () => ChildOf(parent))
</script>
```

## API

### `provideWorld`

Creates a new world and provides it to child components via Svelte context. Returns the created world.

```svelte
<script>
  import { provideWorld } from '@koota/svelte'

  // Create a world and set it in context for child components
  const world = provideWorld()
</script>
```

### `useWorld`

Returns the world held in context via `provideWorld`.

```svelte
<script>
  import { useWorld } from '@koota/svelte'

  const world = useWorld()

  $effect(() => {
    const entity = world.spawn()
    return () => entity.destroy()
  })
</script>
```

### `useQuery`

Reactively updates when entities matching the query change. Returns an object with a reactive `current` property containing a `QueryResult`, which is like an array of entities. Takes a getter that returns the query parameters.

```svelte
<script>
  import { useQuery } from '@koota/svelte'

  // Get all entities with Position and Velocity traits
  const entities = useQuery(() => [Position, Velocity])
</script>

{#each entities.current as entity (entity)}
  <View {entity} />
{/each}
```

Relation pairs with reactive targets work naturally through the getter:

```svelte
<script>
  let { parent } = $props()

  // Re-queries when parent changes
  const children = useQuery(() => [Tag, ChildOf(parent)])
</script>
```

### `useQueryFirst`

Works like `useQuery` but only returns the first result. Can either be an entity or undefined.

```svelte
<script>
  import { useQueryFirst } from '@koota/svelte'

  // Get the first entity with Player and Position traits
  const player = useQueryFirst(() => [Player, Position])
</script>

{#if player.current}
  <View entity={player.current} />
{/if}
```

### `useTrait`

Observes an entity, or world, for a given trait and reactively updates when it is added, removed or changes value. Takes a getter for the target. The returned `current` value may be `undefined` if the trait is no longer on the target. This can be used to conditionally render.

Also accepts relation pairs like `ChildOf(parent)` to observe a specific relation's store data.

```svelte
<script>
  import { useTrait } from '@koota/svelte'

  let { entity } = $props()

  // Get the position trait from an entity and reactively update when it changes
  const position = useTrait(() => entity, Position)

  // Observe a specific relation pair's store data
  const childData = useTrait(() => entity, ChildOf(parent))
</script>

{#if position.current}
  <div>
    Position: {position.current.x}, {position.current.y}
  </div>
{/if}
```

The target getter can return `undefined` or `null`. This helps with situations where `useTrait` is combined with queries in the same component. However, this means that `current` can be `undefined` if the trait is not on the entity or if the target is itself `undefined`. In most cases the distinction will not matter, but if it does you can disambiguate by testing the target.

```svelte
<script>
  // The entity may be undefined if there is no valid result
  const entity = useQueryFirst(() => [Position, Velocity])
  // useTrait handles this by returning undefined if the target does not exist
  const position = useTrait(() => entity.current, Position)
</script>

{#if !entity.current}
  <div>No entity found!</div>
{:else if !position.current}
  <!-- Position was removed from entity -->
{:else}
  <div>
    Position: {position.current.x}, {position.current.y}
  </div>
{/if}
```

### `useTag`

Observes an entity, or world, for a tag and reactively updates when it is added or removed. Returns `true` when the tag is present or `false` when absent. Use this instead of `useTrait` for tags. For tracking the presence of non-tag traits, use `useHas`.

```svelte
<script>
  import { useTag } from '@koota/svelte'

  const IsActive = trait()

  let { entity } = $props()
  const isActive = useTag(() => entity, IsActive)
</script>

{#if isActive.current}
  <div>🟢 Active</div>
{/if}
```

### `useHas`

Observes an entity, or world, for any trait and reactively updates when it is added or removed. Returns `true` when the trait is present or `false` when absent. Unlike `useTrait`, this only tracks presence and not the trait's value.

Also accepts relation pairs like `ChildOf(parent)` or `ChildOf('*')` to track the presence of specific or any relation targets.

```svelte
<script>
  import { useHas } from '@koota/svelte'

  const Health = trait({ amount: 100 })

  let { entity } = $props()

  // Returns true if the entity has the trait, false otherwise
  const hasHealth = useHas(() => entity, Health)

  // Track a specific relation pair
  const isChildOfParent = useHas(() => entity, ChildOf(parent))

  // Track any ChildOf relation
  const hasAnyParent = useHas(() => entity, ChildOf('*'))
</script>

{#if hasHealth.current}
  <div>❤️ Has Health</div>
{/if}
```

### `useTraitEffect`

Subscribes a callback to a trait on an entity. This callback fires whenever the trait is added, removed or changes value without triggering a re-render. Also accepts relation pairs.

```svelte
<script>
  import { useTraitEffect } from '@koota/svelte'

  let { entity } = $props()

  // Subscribe to position changes on an entity and update a reference without causing reactivity
  useTraitEffect(() => entity, Position, (position) => {
    if (!position) return
    mesh.position.copy(position)
  })

  // Subscribe to a specific relation pair
  useTraitEffect(() => entity, ChildOf(parent), (data) => {
    console.log('ChildOf data changed:', data)
  })

  // Subscribe to world-level traits
  const world = useWorld()
  useTraitEffect(() => world, GameState, (state) => {
    if (!state) return
    console.log('Game state changed:', state)
  })
</script>
```

### `useTarget`

Observes an entity, or world, for a relation and reactively returns the first target entity. Returns `undefined` if no target exists.

```svelte
<script>
  import { useTarget } from '@koota/svelte'

  const ChildOf = relation()

  let { entity } = $props()
  const parent = useTarget(() => entity, ChildOf)
</script>

{#if parent.current}
  <div>Parent: {parent.current.id()}</div>
{:else}
  <div>No parent</div>
{/if}
```

### `useTargets`

Observes an entity, or world, for a relation and reactively returns all target entities as an array. Returns an empty array if no targets exist.

```svelte
<script>
  import { useTargets } from '@koota/svelte'

  const Contains = relation()

  let { entity } = $props()
  const items = useTargets(() => entity, Contains)
</script>

<ul>
  {#each items.current as item (item)}
    <li>Item {item.id()}</li>
  {/each}
</ul>
```

### `useActions`

Returns actions bound to the world that is in context. Use actions created by `createActions`.

```svelte
<script>
  import { createActions } from 'koota'
  import { useActions } from '@koota/svelte'

  const actions = createActions((world) => ({
    spawnPlayer: () => world.spawn(IsPlayer),
    destroyAllPlayers: () => {
      world.query(IsPlayer).forEach((player) => {
        player.destroy()
      })
    },
  }))

  const { spawnPlayer, destroyAllPlayers } = useActions(actions)

  $effect(() => {
    spawnPlayer()
    return () => destroyAllPlayers()
  })
</script>
```
