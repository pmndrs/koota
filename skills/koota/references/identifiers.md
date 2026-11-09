# Identifiers

Use `identifier()` for names, wire IDs, slugs and other scalar lookup keys. Keys are exclusive by default. Every call creates an independent type. Define each type once and export it from the application, just like a trait.

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
world.onExit(Player, (entity) => {})

player.add(WireId(456)) // Player no longer matches
player.remove(WireId(123)) // No effect
player.remove(WireId) // Releases 456
```

For values that may repeat, such as user-entered names, use a non-exclusive identifier:

```typescript
export const DisplayName = identifier({ exclusive: false })
const first = world.spawn(DisplayName('kris'))
const second = world.spawn(DisplayName('kris'))
world.lookupAll(DisplayName('kris')) // [first, second]
world.query(DisplayName('kris')) // Both entities
second.add(DisplayName('sam')) // Replaces only second's assignment
world.lookupAll(DisplayName('kris')) // [first]
```

## Contracts

- One key per entity per identifier type. One entity per key per type and world by default, or multiple owners with `exclusive: false`. The option also works with `identifier<number>({ exclusive: false })`.
- `lookupAll` returns a fresh `Entity[]` snapshot for either mode, or `[]` if absent. `lookup` returns one current owner or `undefined`. Do not rely on ordering to select a preferred owner.
- Keys are strings or finite numbers. Equality preserves string versus number, treats `0` and `-0` as equal, and treats `''` and `'*'` as literal strings.
- `I(key)` is the same term for assignment, removal, membership, lookup and query.
- Bare `I` tests presence or removes the current assignment. Assignment and lookup require `I(key)`. Identifiers have no trait data and keys are not entity relation targets.
- Repeating an assignment is a no-op. A different key replaces the previous key only after ownership validation succeeds.
- An exclusive collision throws `[IDENTIFIER_TAKEN]` with assertions enabled and skips the assignment otherwise. Existing mappings remain intact.
- Removing a matching term, removing the identifier type, destroying an entity or resetting its world releases that entity's ownership. Other owners of a shared key remain intact.
- Assignments to an entity during its destruction are ignored, including from removal callbacks.
- Numeric keys have no entity lifecycle. A wire ID that equals an entity handle is still an ordinary value.
- Each assignment is atomic. A multi-term `add` or `spawn` processes terms in argument order.

## Queries and events

`world.query(Name)` matches identifier presence. `world.query(Name('kris'), WireId(123))` requires each result to own both keys, whether exclusive or shared. Term order does not change membership or tracking behavior. Identifier terms are filters, so `each` only receives the data-bearing traits and the entity.

`Not(Name)` and `Or(Name, WireId)` test presence. `Added(Name)` and `Removed(Name)` track presence changes. `Changed(Name)` tracks every assignment, both a first key and a replacement. These modifiers take identifier types, not value terms.

`world.onAdd(Name, (entity, key) => {})` and `world.onRemove(Name('kris'), (entity, key) => {})` observe assignments. Replacement publishes removal of the old key and addition of the new key after committing the mapping. `onChange` observes a first key or a replacement after `onAdd`, provided earlier callbacks have not removed or replaced that assignment. Entity hooks accept the same inputs.

Cached queries and subscriptions follow every current owner. Entity relations can select targets through identifier filters: `ChildOf(Name('kris'), WireId(123))`.

`lookup` and `lookupAll` resolve ownership even for `IsExcluded` entities. Queries retain their usual exclusion rules.

Koota does not export `Name`. Bare-string lookup and `entity.name()` are not part of the API. Use an explicit term for lookup, `targetFor` for reading and `add` for replacement.

## React

```typescript
const players = useQuery(DisplayName('kris')) // Every matching entity
const player = useQueryFirst(WireId(123)) // Entity | undefined
const name = useTarget(player, Name) // string | undefined
const wireId = useTarget(player, WireId) // number | undefined
const hasWireId = useHas(player, WireId)
const matches = useHas(player, WireId(123))
```

Import these hooks from `koota/react`. `useTarget` observes the key, `useHas` observes presence or an exact term, and `useQuery` or `useQueryFirst` observes owners through the query system. They follow replacement, removal and destruction. Nullish sources return `undefined` from `useTarget` and `false` from `useHas`. Inline terms do not need memoization.

## Scoped identifiers

Choose one exclusive relation to supply an identifier's immediate scope. Entities without that
relation belong to the root scope. Names may repeat under different parents, while exclusive
keys must remain unique among siblings.

```ts
const ChildOf = relation({ exclusive: true })
const Name = identifier({ scope: ChildOf })

const robot = world.spawn(Name('robot'))
const arm = world.spawn(Name('arm'), ChildOf(robot))
const motor = world.spawn(Name('motor'), ChildOf(arm))

world.lookup(Name('robot'), Name('arm'), Name('motor')) // motor
world.lookup(robot, Name('arm'), Name('motor')) // motor
world.lookup(arm, Name('motor')) // motor
world.lookup(Name('motor')) // undefined, only the root scope is searched
```

Each path segment resolves in the entity returned by the preceding segment. Missing segments
return `undefined`. Lookup does not search descendants or fall back to ancestor scopes. Keys
remain literal scalars, so a name containing dots or slashes is not parsed as a path. Scope
entities need not have names.

Paths can mix identifier types. A global robot ID can identify the initial scope, followed by a
local component name:

```ts
const RobotId = identifier<number>()
robot.add(RobotId(101))
world.lookup(RobotId(101), Name('arm'), Name('motor')) // motor
```

Only the first key can be unscoped. Every subsequent identifier must have a scoping relation.
`lookupAll` accepts the same paths and returns all owners of the final key in the resolved scope.
Shared intermediate keys select one current owner, so use exclusive keys for deterministic paths.

`Name('motor')` still means a local key for `has`, removal, queries and subscriptions.
`world.query(Name('motor'))` matches that local name across all scopes. Add `ChildOf(arm)` to
restrict the query to one parent. Reparenting updates lookup ownership without changing the local
name or emitting a name assignment event. Relation queries and subscriptions observe the move.

A relation selected as an identifier scope must be exclusive. Scoping changes nothing else about
the relation. Lookups resolve one parent at a time and never walk ancestors, so the graph is not
checked for cycles. Moving or detaching an entity validates all identifiers using that relation
before changing any mapping. A collision refuses the entire move with `[IDENTIFIER_TAKEN]`. With
assertions disabled, invalid moves are skipped. Removing the parent relation moves names into the
root scope and follows the same collision rules.

Destroying a parent follows the relation's own `autoDestroy` policy. With `autoDestroy: 'orphan'`
the descendants are destroyed with it and their keys are released. Without it, the children move
to the root scope. A destroy cannot be refused, so an orphan whose exclusive key is already taken
at the root loses that key with the usual removal event and keeps everything else.

```ts
const ChildOf = relation({ exclusive: true, autoDestroy: 'orphan' })
const Name = identifier({ scope: ChildOf })

const robot = world.spawn(Name('robot'))
const motor = world.spawn(Name('motor'), ChildOf(robot))
robot.destroy() // motor is destroyed and both keys are released
```

When a scoped identifier precedes its parent pair in the same `spawn` or `add`, that following
pair is applied before the name. This avoids temporarily claiming a root key. Multi-term calls
are otherwise sequential, so this is not a transaction that can rename and reparent through an
otherwise conflicting intermediate state.

Use `identifier({ scope: ChildOf, exclusive: false })` to allow shared keys inside each scope.
Changing a parent's name or application ID does not rewrite descendants' local keys.

### Querying scoped names

Combine a local identifier with relation filters to query a specific parent or a named path.
Each nested relation describes one immediate parent. Add ordinary traits to filter and read the
matching entities' data.

```ts
// A known immediate parent
world.query(Name('motor'), ChildOf(arm), Position)

// The arm named "arm" under a robot identified by its global ID
const Motors = createQuery(Name('motor'), ChildOf(Name('arm'), ChildOf(RobotId(101))), Position)
world.query(Motors).each((position, motor) => {
  position.x += 1
})

// The same path relative to a known robot entity
world.query(Name('motor'), ChildOf(Name('arm'), ChildOf(robot)), Position)

// A full name path anchored at the root
world.query(Name('motor'), ChildOf(Name('arm'), ChildOf(Name('robot'), Not(ChildOf('*')))))
```

Identifier query terms match their local names across scopes. The root restriction above makes
the named path match the root-started lookup. Omitting it also matches paths whose robot is
nested under another entity. A global identifier such as `RobotId` needs no root restriction.

Cached queries, live views and query subscriptions follow changes to ancestor identifiers and
parent relations, as well as changes to the result entities. Shared intermediate names match
every qualifying branch. Query exclusions apply at each level.

Separate terms in `world.query(Name('robot'), Name('motor'))` require one entity to own both
keys and therefore match nothing. Use nested relation filters to express the path.
