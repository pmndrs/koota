---
title: API
description: Svelte integration API
nav: 9
---

Import Svelte bindings from `koota/svelte`. They require Svelte 5 and return objects whose `current` property is reactive.

Every `use*` binding reads a world from context, including bindings whose target is a `World`. Call `provideWorld` during component initialization before using bindings in that component or its descendants.

The examples below assume application traits such as `Position`, `Velocity`, and `IsPlayer`, and relations such as `ChildOf` and `Contains`, are defined in framework-agnostic modules.

## `provideWorld`

Provides a world through Svelte context and returns that world. Create the world outside the component or during component initialization so it remains stable, then call `provideWorld` during component initialization.

```svelte
<script>
  import { createWorld } from 'koota'
  import { provideWorld } from 'koota/svelte'

  const world = provideWorld(createWorld())
</script>

<Game />
```

## `useWorld`

Returns the world from the nearest Koota context. It throws if no world has been provided.

```svelte
<script>
  import { useWorld } from 'koota/svelte'

  const world = useWorld()

  $effect(() => {
    const entity = world.spawn()
    return () => entity.destroy()
  })
</script>
```

## `useQuery`

Returns an object whose reactive `current` property contains a `QueryResult`. It updates when entities enter or leave the result.

Pass query parameters variadically, or pass a getter when they depend on reactive state:

```svelte
<script>
  import { useQuery } from 'koota/svelte'

  let { parent } = $props()

  const rockets = useQuery(Position, Velocity)
  const children = useQuery(() => [Position, ChildOf(parent)])
</script>

{#each rockets.current as entity (entity)}
  <RocketView {entity} />
{/each}
```

## `useQueryFirst`

Works like `useQuery`, but `current` contains only the first matching entity or `undefined`.

```svelte
<script>
  import { useQueryFirst } from 'koota/svelte'

  const player = useQueryFirst(IsPlayer, Position)
</script>

{#if player.current}
  <View entity={player.current} />
{/if}
```

## `useTrait`

Observes a trait on an entity or world. `current` updates when the trait is added, removed, or changed, and is `undefined` when the target is nullish or does not have the trait.

The target is always a getter. The trait or relation pair can be passed directly or as a getter; use a getter when a relation pair depends on reactive state.

```svelte
<script>
  import { useTrait } from 'koota/svelte'

  let { entity, parent } = $props()

  const position = useTrait(() => entity, Position)
  const childData = useTrait(() => entity, () => ChildOf(parent))
</script>

{#if position.current}
  <div>Position: {position.current.x}, {position.current.y}</div>
{/if}
```

A nullish target is useful when combining `useTrait` with `useQueryFirst`:

```svelte
<script>
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

## `useTag`

Observes a tag on an entity or world. `current` is `true` when the tag is present and `false` when it is absent or the target is nullish. Use `useHas` to observe the presence of data-bearing traits.

```svelte
<script>
  import { useTag } from 'koota/svelte'

  let { entity } = $props()
  const isActive = useTag(() => entity, IsActive)
</script>

{#if isActive.current}
  <div>Active</div>
{/if}
```

## `useHas`

Observes the presence of any trait or relation pair on an entity or world. `current` is a boolean; changes to a trait's value do not affect it.

```svelte
<script>
  import { useHas } from 'koota/svelte'

  let { entity, parent } = $props()

  const hasHealth = useHas(() => entity, Health)
  const isChildOfParent = useHas(() => entity, () => ChildOf(parent))
  const hasAnyParent = useHas(() => entity, ChildOf('*'))
</script>

{#if hasHealth.current}
  <div>Has health</div>
{/if}
```

## `useTraitEffect`

Runs a callback with the current trait value when its effect starts and again whenever the trait is added, removed, or changed. A missing or removed trait produces `undefined`. Reads inside the callback are untracked.

Unlike `useTrait`, the target getter must return an entity or world; it cannot return `null` or `undefined`.

```svelte
<script>
  import { useTraitEffect, useWorld } from 'koota/svelte'

  let { entity, parent, move } = $props()

  useTraitEffect(() => entity, Position, (position) => {
    if (position) move(position.x, position.y)
  })

  useTraitEffect(() => entity, () => ChildOf(parent), (data) => {
    console.log('ChildOf data:', data)
  })

  const world = useWorld()
  useTraitEffect(() => world, GameState, (state) => {
    console.log('Game state:', state)
  })
</script>
```

## `useTarget`

Observes a relation on an entity or world. `current` is the first target entity, or `undefined` when no target exists or the source target is nullish.

```svelte
<script>
  import { useTarget } from 'koota/svelte'

  let { entity } = $props()
  const parent = useTarget(() => entity, ChildOf)
</script>

{#if parent.current}
  <div>Parent: {parent.current.id()}</div>
{:else}
  <div>No parent</div>
{/if}
```

## `useTargets`

Observes a relation on an entity or world. `current` contains all target entities and is an empty array when none exist or the source target is nullish.

```svelte
<script>
  import { useTargets } from 'koota/svelte'

  let { entity } = $props()
  const items = useTargets(() => entity, Contains)
</script>

<ul>
  {#each items.current as item (item)}
    <li>Item {item.id()}</li>
  {/each}
</ul>
```

## `useActions`

Calls an action initializer with the world from context and returns the bound actions. Use it with actions created by `createActions`.

```svelte
<script>
  import { createActions } from 'koota'
  import { useActions } from 'koota/svelte'

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
