---
name: koota
description: Real-time ECS state management for TypeScript and React. Use when the user mentions koota, ECS, entities, traits, queries, or building data-oriented applications.
---

# Koota

Koota is data-oriented: data lives on traits, entities compose traits, and behavior is a function over the data. Nothing owns behavior. Use these terms exactly and keep the concepts distinct in both naming and code.

## Glossary

| Term      | Meaning                                                              | Not          |
| --------- | -------------------------------------------------------------------- | ------------ |
| Entity    | A handle. Identity only, no data of its own.                         | object, node |
| Trait     | A shape of data an entity is composed of. Schema, callback, or tag.  | component    |
| World     | An isolated context holding entities and their trait data.           | store, scene |
| Query     | Selects entities by the traits they have. Read and write in bulk.    | selector     |
| Action    | A synchronous command that mutates a world. Callable from anywhere.  | reducer      |
| System    | A function of a world that transforms queried data each tick.        | controller   |
| Relation  | A trait parameterized by a target entity. Builds directed graphs.    | reference    |

## Entity is identity

```typescript
const entity = world.spawn(Position, Velocity)
entity.get(Position) // read trait data through the handle
entity.destroy() // the handle is recycled, the data is gone
```

An entity is a packed number (id, generation, world). Safe to store, compare, and send over the wire.

## Trait is the data model

There is no other place data lives.

```typescript
const Position = trait({ x: 0, y: 0 }) // schema, stored SoA
const Ref = trait(() => new Object3D()) // callback, stored AoS
const IsPlayer = trait() // tag, no data
```

Traits are nouns. Tags start with `Is`. Prefer traits over classes for anything that is state.

## World is an isolated context

Two worlds share nothing.

```typescript
const world = createWorld()
world.spawn(Position) // entity lives in this world
world.query(Position) // reads only this world
```

Everything else in koota takes a world as input.

## Actions are commands on a world

Actions are the write API for everything outside the frame loop, including UI, tests, and network handlers.

```typescript
export const actions = createActions((world) => ({
  spawnPlayer: () => world.spawn(Position, Velocity, IsPlayer),
  damage: (entity: Entity, amount: number) => {
    const health = entity.get(Health)
    if (health) entity.set(Health, { value: health.value - amount })
  },
}))

actions(world).spawnPlayer() // vanilla
useActions(actions).spawnPlayer() // React
```

## Systems mutate data and create behavior

Behavior emerges from which systems run, in what order.

```typescript
function applyVelocity(world: World) {
  world.query(Position, Velocity).updateEach(([pos, vel]) => {
    pos.x += vel.x
    pos.y += vel.y
  })
}
```

Systems are the only place that should iterate queries in bulk. Keep each system to one concern so behaviors can be toggled independently.

## Relations are directional connections

```typescript
const ChildOf = relation({ autoDestroy: 'orphan' })
const child = world.spawn(ChildOf(parent))

world.query(ChildOf(parent)) // children of parent
world.query(ChildOf('*')) // any entity with a parent
child.targetFor(ChildOf) // the parent
```

Name relations as prepositions: `ChildOf`, `HeldBy`, `Contains`.

## Preferred architecture

Build a headless app first: traits, actions, and systems over a world, in pure TypeScript with no view imports. It runs and is testable without any renderer.

A view, such as React or Svelte, projects a render from that data. It reads traits and writes through actions.

The view is its own domain, not a thin layer. It may define view-only traits, systems, and actions, such as a `Ref` trait holding a DOM node or a system that syncs positions to meshes. The boundary is the direction of dependency: the view depends on the headless app, never the reverse.

## Gotchas

- `updateEach` and `readEach` pass only data-bearing traits. Tags, `Not()`, and relation filters are excluded from the tuple.
- Direct mutation of AoS objects fires no change event. Call `entity.changed(Trait)` after.
- `entity.id()` is recycled after destroy. Store the entity itself, not its id, when you need uniqueness.
- Import `World` and `Entity` types from `koota`, hooks from `koota/react`.
