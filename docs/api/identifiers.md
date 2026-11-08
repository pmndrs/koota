---
title: Identifiers
description: Exclusive or shared scalar keys for entities
nav: 9
---

`identifier<K>(options?)` defines a namespace of string or finite-number keys. Within each world, an entity has at most one key in that namespace. Keys are exclusive by default, with at most one owner per key. Set `exclusive: false` to let multiple entities share a key. `K` defaults to `string`. Each factory call creates an independent namespace.

```ts
import { createQuery, identifier } from 'koota'

const Name = identifier()
const WireId = identifier<number>()
const player = world.spawn(Name('kris'), WireId(123), Position)

world.lookup(Name('kris')) // player
world.lookup(WireId(123)) // player
player.targetFor(Name) // 'kris'
player.targetsFor(WireId) // [123]
player.has(WireId(123)) // true

world.query(Name, Position) // Identifier presence
world.query(Name('kris'), WireId(123), Position) // All terms must match
const Player = createQuery(Name('kris'), WireId(123), Position)
world.query(Player).each((position, entity) => {})
```

Define and export types once so callers share the same namespace. Koota has no built-in `Name`, `entity.name()` or bare-string lookup.

The identifier type `I` names the namespace. The term `I(key)` names an exact mapping and is required for assignment and lookup. Identifiers have no trait data and their keys are not entity relation targets.

## Shared values

Use non-exclusive identifiers for user-entered names or other values that can repeat:

```ts
const DisplayName = identifier({ exclusive: false })
const first = world.spawn(DisplayName('kris'), Position)
const second = world.spawn(DisplayName('kris'), Position)

world.lookupAll(DisplayName('kris')) // [first, second]
world.query(DisplayName('kris'), Position) // Both entities
second.add(DisplayName('sam'))
world.lookupAll(DisplayName('kris')) // [first]
second.targetFor(DisplayName) // 'sam'
```

Each entity still has only one key per namespace. Replacing, removing or destroying one owner leaves the other owners intact. The option also works with numeric keys: `identifier<number>({ exclusive: false })`.

`lookupAll` returns a fresh snapshot array for either exclusive or shared keys, and `[]` when absent. Mutating the array does not change assignments. `lookup` returns one current owner or `undefined`, so use `lookupAll` or a query when all matches matter. Lookup and query ordering should not be used to choose a preferred owner.

## Assignment and ownership

| Operation                 | Contract                                                   |
| ------------------------- | ---------------------------------------------------------- |
| `entity.add(I(key))`      | Assign a key, replacing the current value after validation |
| `entity.remove(I(key))`   | Release the key only if this term matches                  |
| `entity.remove(I)`        | Release the current key                                    |
| `entity.has(I(key))`      | Test this exact mapping                                    |
| `entity.has(I)`           | Test identifier presence                                   |
| `entity.targetFor(I)`     | Read the current key, or `undefined`                       |
| `world.lookup(I(key))`    | Resolve one current owner, or `undefined`                  |
| `world.lookupAll(I(key))` | Return all current owners as an `Entity[]` snapshot        |

Adding an identical term does nothing. For exclusive identifiers, a key already owned by another entity is refused before either mapping changes. With assertions enabled, the operation throws `[IDENTIFIER_TAKEN]`. With assertions disabled, it skips the assignment. Each assignment is atomic, while multi-term `add` and `spawn` process terms in argument order.

```ts
player.add(WireId(456))
world.lookup(WireId(123)) // undefined
world.lookup(WireId(456)) // player
player.remove(WireId(123)) // No effect
player.remove(WireId(456)) // Releases 456
```

Removing an identifier, destroying its entity or resetting the world releases its keys. A key can then belong to a new entity. Assignments to an entity during its destruction are ignored, so removal callbacks cannot leave a dead owner in the index. Numeric keys have no entity lifecycle, even when their value equals an entity handle.

Keys use exact scalar equality. Numbers and strings are distinct, `0` and `-0` are equal, and empty strings and `'*'` are literal keys. Objects, `null`, `undefined`, `NaN` and infinities are rejected. Use `targetFor` and `add` for identifiers. `get` and `set` operate on trait and relation data.

## Queries and lifecycle

Multiple terms use AND semantics. Each result must own every requested key, whether exclusive or shared. Term order does not change membership or tracking behavior. Identifier filters do not add data arguments to iteration callbacks. Cached queries and query subscriptions follow replacement, removal and key reuse for every owner.

```ts
world.onEnter([Name('kris'), WireId(123)], (entity) => {})
world.onExit([Name('kris'), WireId(123)], (entity) => {})

// Entity relations can select targets through identifiers
world.query(ChildOf(Name('kris'), WireId(123)))

world.onAdd(WireId, (entity, key) => {})
world.onRemove(WireId(123), (entity, key) => {})
player.onChange(WireId, (entity, key) => {})
```

Assignment hooks receive the key. `onChange` reports every assignment, so it fires after `onAdd` for a first key and for a replacement, if that assignment is still current. Replacement publishes removal of the old term and addition of the new term after the mapping is committed. Identical assignments and refused collisions publish nothing.

`Not(I)` and `Or(I, J)` test presence. `Added(I)` and `Removed(I)` track presence changes, while `Changed(I)` tracks every assignment, both a first key and a replacement. Tracking modifiers are created with `createAdded`, `createRemoved` and `createChanged`. Modifiers take identifier types, not value terms.

`lookup` and `lookupAll` resolve ownership for all entities, including `IsExcluded`. Identifier queries follow normal query exclusion rules.

## React

Use the existing hooks to observe identifier mappings in either direction:

```ts
import { useHas, useQuery, useQueryFirst, useTarget } from 'koota/react'

const players = useQuery(DisplayName('kris')) // Every matching entity
const player = useQueryFirst(WireId(123)) // Entity | undefined
const name = useTarget(player, Name) // string | undefined
const wireId = useTarget(player, WireId) // number | undefined
const hasName = useHas(player, Name) // Identifier presence
const isKris = useHas(player, Name('kris')) // Exact mapping
```

The hooks follow assignment, replacement, removal and destruction. A nullish source produces `undefined` from `useTarget` and `false` from `useHas`. Inline identifier terms do not need memoization. See the [React API](../react/api.md) for details.
