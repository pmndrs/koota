# koota/svelte

Svelte 5 bindings for [Koota](https://github.com/pmndrs/koota), an ECS-based state management library for real-time apps, games, and XR experiences.

## Installation

Install `koota` in a Svelte 5 project:

```sh
pnpm add koota
```

Import core APIs from `koota` and Svelte bindings from `koota/svelte`.

## Getting started

Define application traits in a shared module:

```ts
// traits.ts
import { trait } from 'koota'

export const Position = trait({ x: 0, y: 0 })
export const Velocity = trait({ x: 0, y: 0 })
```

Create a world near the root of the component tree and provide it through Svelte context. Call `provideWorld` during component initialization, before using any other Koota Svelte binding in that component or its descendants.

```svelte
<!-- App.svelte -->
<script lang="ts">
  import { createWorld } from 'koota'
  import { provideWorld, useQuery } from 'koota/svelte'
  import RocketView from './RocketView.svelte'
  import { Position, Velocity } from './traits'

  const world = provideWorld(createWorld())
  world.spawn(Position({ x: 40, y: 40 }), Velocity)

  // `current` updates when entities enter or leave the query.
  const rockets = useQuery(Position, Velocity)
</script>

{#each rockets.current as entity (entity)}
  <RocketView {entity} />
{/each}
```

Bindings return objects whose `current` property is reactive:

```svelte
<!-- RocketView.svelte -->
<script lang="ts">
  import type { Entity } from 'koota'
  import { useTrait } from 'koota/svelte'
  import { Position } from './traits'

  let { entity }: { entity: Entity } = $props()
  const position = useTrait(() => entity, Position)
</script>

{#if position.current}
  <div
    style:position="absolute"
    style:left={`${position.current.x}px`}
    style:top={`${position.current.y}px`}
  >
    🚀
  </div>
{/if}
```

All `use*` bindings read the world from context, including bindings whose target is a `World`. Calling one without first calling `provideWorld` in the same component or an ancestor throws an error.

## Reactive arguments

Target-based bindings take a getter as their first argument. When the entity or world returned by that getter changes, the binding subscribes to the new target.

Trait, tag, and relation arguments can be either direct values or getters. Use direct values for module-level constants. Use a getter when constructing a relation pair from reactive state:

```svelte
<script lang="ts">
  import type { Entity } from 'koota'
  import { relation } from 'koota'
  import { useTrait } from 'koota/svelte'
  import { Position } from './traits'

  const ChildOf = relation({ store: { order: 0 } })

  let { entity, parent }: { entity: Entity; parent: Entity } = $props()

  // Static trait: pass it directly.
  const position = useTrait(() => entity, Position)

  // Dynamic relation pair: rebuild it when `parent` changes.
  const childData = useTrait(() => entity, () => ChildOf(parent))
</script>
```

Queries accept either variadic parameters or a getter that returns the complete parameter list:

```svelte
<script lang="ts">
  import type { Entity } from 'koota'
  import { relation } from 'koota'
  import { useQuery } from 'koota/svelte'
  import { Position, Velocity } from './traits'

  const ChildOf = relation()

  let { parent }: { parent: Entity } = $props()

  const moving = useQuery(Position, Velocity)
  const children = useQuery(() => [Position, ChildOf(parent)])
</script>
```

## Mutating state

Use actions to keep mutations reusable and bind them to the world in context:

```svelte
<script lang="ts">
  import { createActions } from 'koota'
  import { useActions } from 'koota/svelte'
  import { Position, Velocity } from './traits'

  const shipActions = createActions((world) => ({
    spawnShip: (position: { x: number; y: number }) =>
      world.spawn(Position(position), Velocity),
    destroyAllShips: () => {
      world.query(Position, Velocity).forEach((entity) => entity.destroy())
    },
  }))

  const { spawnShip, destroyAllShips } = useActions(shipActions)
</script>

<button onclick={() => spawnShip({ x: 10, y: 20 })}>Spawn ship</button>
<button onclick={destroyAllShips}>Destroy all ships</button>
```

For local component behavior, you can also access the world directly:

```svelte
<script lang="ts">
  import { useWorld } from 'koota/svelte'
  import { Position, Velocity } from './traits'

  const world = useWorld()

  $effect(() => {
    const entity = world.spawn(Position, Velocity)
    return () => entity.destroy()
  })
</script>
```

## API

### `provideWorld`

Provides a world through Svelte context and returns that world. Call it during component initialization.

```svelte
<script lang="ts">
  import { createWorld } from 'koota'
  import { provideWorld } from 'koota/svelte'

  const world = provideWorld(createWorld())
</script>
```

### `useWorld`

Returns the world from the nearest Koota context. It throws if no world has been provided.

```svelte
<script lang="ts">
  import { useWorld } from 'koota/svelte'

  const world = useWorld()
</script>
```

### `useQuery`

Returns an object whose reactive `current` property contains a `QueryResult`, an array-like collection of entities matching the query. It updates when entities enter or leave the query.

Pass query parameters variadically, or pass a getter when the parameters depend on reactive state:

```svelte
<script lang="ts">
  import type { Entity } from 'koota'
  import { relation } from 'koota'
  import { useQuery } from 'koota/svelte'
  import { Position, Velocity } from './traits'

  const ChildOf = relation()

  let { parent }: { parent: Entity } = $props()

  const moving = useQuery(Position, Velocity)
  const children = useQuery(() => [Position, ChildOf(parent)])
</script>

{#each children.current as child (child)}
  <div>Child {child.id()}</div>
{/each}
```

### `useQueryFirst`

Works like `useQuery`, but `current` contains only the first matching entity or `undefined`. It supports the same variadic and getter forms.

```svelte
<script lang="ts">
  import { trait } from 'koota'
  import { useQueryFirst } from 'koota/svelte'
  import { Position } from './traits'

  const IsPlayer = trait()
  const player = useQueryFirst(IsPlayer, Position)
</script>

{#if player.current}
  <div>Player {player.current.id()}</div>
{/if}
```

### `useTrait`

Observes a trait on an entity or world. `current` updates when the trait is added, removed, or changed, and is `undefined` when the target is nullish or does not have the trait.

The target must be a getter. The trait or relation pair can be direct or returned by a getter:

```svelte
<script lang="ts">
  import type { Entity } from 'koota'
  import { relation } from 'koota'
  import { useTrait } from 'koota/svelte'
  import { Position } from './traits'

  const ChildOf = relation({ store: { order: 0 } })

  let { entity, parent }: { entity: Entity; parent: Entity } = $props()

  const position = useTrait(() => entity, Position)
  const childData = useTrait(() => entity, () => ChildOf(parent))
</script>

{#if position.current}
  <div>Position: {position.current.x}, {position.current.y}</div>
{/if}
```

A nullish target is useful with `useQueryFirst`:

```svelte
<script lang="ts">
  import { useQueryFirst, useTrait } from 'koota/svelte'
  import { Position, Velocity } from './traits'

  const entity = useQueryFirst(Position, Velocity)
  const position = useTrait(() => entity.current, Position)
</script>

{#if !entity.current}
  <div>No matching entity</div>
{:else if !position.current}
  <div>The entity no longer has Position</div>
{:else}
  <div>Position: {position.current.x}, {position.current.y}</div>
{/if}
```

### `useTag`

Observes a tag on an entity or world. `current` is `true` when the tag is present and `false` when it is absent or the target is nullish. Use `useHas` to observe the presence of data-bearing traits.

```svelte
<script lang="ts">
  import type { Entity } from 'koota'
  import { trait } from 'koota'
  import { useTag } from 'koota/svelte'

  const IsActive = trait()

  let { entity }: { entity: Entity } = $props()
  const isActive = useTag(() => entity, IsActive)
</script>

{#if isActive.current}
  <div>Active</div>
{/if}
```

### `useHas`

Observes the presence of any trait or relation pair on an entity or world. `current` is a boolean; changes to a trait's value do not affect it.

```svelte
<script lang="ts">
  import type { Entity } from 'koota'
  import { relation, trait } from 'koota'
  import { useHas } from 'koota/svelte'

  const Health = trait({ amount: 100 })
  const ChildOf = relation()

  let { entity, parent }: { entity: Entity; parent: Entity } = $props()

  const hasHealth = useHas(() => entity, Health)
  const isChildOfParent = useHas(() => entity, () => ChildOf(parent))
  const hasAnyParent = useHas(() => entity, ChildOf('*'))
</script>
```

### `useTraitEffect`

Runs a callback with the current trait value when its effect starts and again whenever the trait is added, removed, or changed. A missing or removed trait produces `undefined`. Reads inside the callback are untracked, so they do not become dependencies of the binding's internal effect.

Unlike `useTrait`, its target getter must return an entity or world; it cannot return `null` or `undefined`.

```svelte
<script lang="ts">
  import type { Entity } from 'koota'
  import { relation } from 'koota'
  import { useTraitEffect, useWorld } from 'koota/svelte'
  import { Position } from './traits'

  const ChildOf = relation({ store: { order: 0 } })

  let {
    entity,
    parent,
    move,
  }: {
    entity: Entity
    parent: Entity
    move: (x: number, y: number) => void
  } = $props()

  useTraitEffect(() => entity, Position, (position) => {
    if (position) move(position.x, position.y)
  })

  useTraitEffect(() => entity, () => ChildOf(parent), (data) => {
    console.log('ChildOf data:', data)
  })

  const world = useWorld()
  useTraitEffect(() => world, Position, (position) => {
    console.log('World position:', position)
  })
</script>
```

### `useTarget`

Observes a relation on an entity or world. `current` is the first target entity, or `undefined` when no target exists or the source target is nullish.

```svelte
<script lang="ts">
  import type { Entity } from 'koota'
  import { relation } from 'koota'
  import { useTarget } from 'koota/svelte'

  const ChildOf = relation()

  let { entity }: { entity: Entity } = $props()
  const parent = useTarget(() => entity, ChildOf)
</script>

{#if parent.current}
  <div>Parent: {parent.current.id()}</div>
{:else}
  <div>No parent</div>
{/if}
```

### `useTargets`

Observes a relation on an entity or world. `current` contains all target entities and is an empty array when none exist or the source target is nullish.

```svelte
<script lang="ts">
  import type { Entity } from 'koota'
  import { relation } from 'koota'
  import { useTargets } from 'koota/svelte'

  const Contains = relation()

  let { entity }: { entity: Entity } = $props()
  const items = useTargets(() => entity, Contains)
</script>

<ul>
  {#each items.current as item (item)}
    <li>Item {item.id()}</li>
  {/each}
</ul>
```

### `useActions`

Calls an action initializer with the world from context and returns the bound actions. Use it with actions created by `createActions`.

```svelte
<script lang="ts">
  import { createActions, trait } from 'koota'
  import { useActions } from 'koota/svelte'

  const IsPlayer = trait()
  const playerActions = createActions((world) => ({
    spawnPlayer: () => world.spawn(IsPlayer),
    destroyAllPlayers: () => {
      world.query(IsPlayer).forEach((player) => player.destroy())
    },
  }))

  const { spawnPlayer, destroyAllPlayers } = useActions(playerActions)
</script>

<button onclick={spawnPlayer}>Spawn player</button>
<button onclick={destroyAllPlayers}>Destroy all players</button>
```
