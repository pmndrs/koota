# Identifiers

Use `identifier()` for names, wire IDs, slugs and other unique lookup keys. Every call creates an independent type. Define each type once and export it from the application, just like a trait.

```typescript
import { createQuery, identifier } from 'koota'

export const Name = identifier()
export const WireId = identifier<number>()

const player = world.spawn(Name('kris'), WireId(123), Position)
world.lookup(Name('kris')) // player
player.targetFor(WireId) // 123
player.has(WireId(123)) // true

const Player = createQuery(Name('kris'), WireId(123), Position)
world.query(Player).each((position, entity) => {})
world.onQueryRemove(Player, (entity) => {})

player.add(WireId(456)) // Player no longer matches
player.remove(WireId(123)) // No effect
player.remove(WireId) // Releases 456
```

## Contracts

- One key per entity per identifier type, and one entity per key per type and world.
- Keys are strings or finite numbers. Equality preserves string versus number, treats `0` and `-0` as equal, and treats `''` and `'*'` as literal strings.
- `I(key)` is the same term for assignment, removal, membership, lookup and query.
- Bare `I` tests presence or removes the current assignment. Assignment and lookup require `I(key)`. Identifiers have no trait data and keys are not entity relation targets.
- Repeating an assignment is a no-op. A different key replaces the previous key only after ownership validation succeeds.
- A collision throws `[IDENTIFIER_TAKEN]` with assertions enabled and skips the assignment otherwise. Existing mappings remain intact.
- Removing a matching term, removing the identifier type, destroying an entity or resetting its world releases ownership.
- Assignments to an entity during its destruction are ignored, including from removal callbacks.
- Numeric keys have no entity lifecycle. A wire ID that equals an entity handle is still an ordinary value.
- Each assignment is atomic. A multi-term `add` or `spawn` processes terms in argument order.

## Queries and events

`world.query(Name)` matches identifier presence. `world.query(Name('kris'), WireId(123))` requires both terms to resolve to the same entity. Term order does not change membership or tracking behavior. Identifier terms are filters, so `each` only receives the data-bearing traits and the entity.

`Not(Name)` and `Or(Name, WireId)` test presence. `Added(Name)` and `Removed(Name)` track presence changes. `Changed(Name)` tracks every assignment, both a first key and a replacement. These modifiers take identifier types, not value terms.

`world.onAdd(Name, (entity, key) => {})` and `world.onRemove(Name('kris'), (entity, key) => {})` observe assignments. Replacement publishes removal of the old key and addition of the new key after committing the mapping. `onChange` observes a first key or a replacement after `onAdd`, provided earlier callbacks have not removed or replaced that assignment. Entity hooks accept the same inputs.

Cached queries and subscriptions follow the current owner. Entity relations can select targets through identifier filters: `ChildOf(Name('kris'), WireId(123))`.

`lookup` resolves ownership even for `IsExcluded` entities. Queries retain their usual exclusion rules.

Koota does not export `Name`. Bare-string lookup and `entity.name()` are not part of the API. Use an explicit term for lookup, `targetFor` for reading and `add` for replacement.

## React

```typescript
const player = useQueryFirst(WireId(123)) // Entity | undefined
const name = useTarget(player, Name) // string | undefined
const wireId = useTarget(player, WireId) // number | undefined
const hasWireId = useHas(player, WireId)
const matches = useHas(player, WireId(123))
```

Import these hooks from `koota/react`. `useTarget` observes the key, `useHas` observes presence or an exact term, and `useQueryFirst` observes the owner through the query system. They follow replacement, removal and destruction. Nullish sources return `undefined` from `useTarget` and `false` from `useHas`. Inline terms do not need memoization.
