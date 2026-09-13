# ECS kernel design

`src/kernel` is the kernel rewrite that aligns Koota with the Iris reference:
explicit world on every call, numeric identities for everything, archetype
storage, filters that cache matching archetypes, revision stamps for change
detection, and one observer fan-out for lifecycle events. The public API is
built on top of it and may be slower or more involved than the kernel.

This note records the decisions and where they differ from Iris and from the
previous kernel.

## Identity

| Kind      | Encoding                                   | Notes                                              |
| --------- | ------------------------------------------ | -------------------------------------------------- |
| Entity    | `generation << 21 \| index`, index ≥ 1     | World-local. 29 bits, Smi-safe. Index 0 is null.  |
| Trait | Registry index, `1 ≤ id < 2^21`            | Global, shared by every world.                     |
| Pair      | `2^29 \| relationIndex << 21 \| targetIdx` | Computed, never interned. Relation index 0 is `*`. |

Entities are world-local. Every kernel operation takes the world explicitly.
Global uniqueness across worlds, entity methods on numbers, and finalization
belong to the API layer, which maps public handles to `(world, entity)`.

Generations retire a slot at 255 instead of wrapping, so a recycled handle
never becomes valid again. A pair does not carry the target's generation. The
kernel removes every pair to a target from every archetype when the target is
destroyed, so no live state references a dead target.

Relations are limited to 255 per process plus the wildcard. Entities per world
are limited to 2,097,151.

## Definitions

`defineTrait(schema?)` and `defineRelation(options?)` register global
definitions, like Iris. A schema is a Koota schema: a record of defaults and
factories, an AoS factory, or nothing for a tag. The registry compiles it into a
column plan: field names, numeric flags, defaults, and factories. Factories
receive the world and the entity they construct for. Every field is
a plain array column. Numeric columns start as packed doubles and clear to zero
so they keep that layout; typed-array columns can become an explicit schema
option later. AoS storage is one reference column.

Definitions are not entities. A world that needs a trait as a relation target
creates an ordinary entity for it in the API layer.

## Storage

Entities live in exactly one archetype. An archetype owns a sorted type list,
dense entity array, one column per field per data-bearing type, and two
`Float64Array` stamp columns per type: `added` and `changed`. Capacity starts at
4 and doubles. Transitions use cached edges. Adding a trait copies the row's
shared columns into the destination archetype, the same as Iris.

Each type in an archetype has one record holding its stamp slot, column plan,
columns, and remove hook, so presence, data, and stamps resolve with a single
lookup by type id, the way a Flecs table record does. Row moves walk the
destination's records once. `Map.get` on Smi keys measured within a nanosecond
of a linear scan up to eight types and faster beyond, so the record map stays.
The `Unchecked` entry points for `has`, `get`, and `set` skip the generation
check for callers that already validated the handle, such as the public layer
after resolving it, and only test that the slot is occupied.
Labs, eight fresh blocks each, before and after the record merge: kernel `has`
63 to 59 µs, kernel set and get 439 to 414 µs, tag toggle 1.47 to 1.28 ms,
shared pair add and remove 2.95 to 2.71 ms, public `entity.has` 285 to 260 µs,
public get and set 1.28 to 1.23 ms, all per 10,000 entities.

Columns are plain arrays allocated at exact capacity and grown in place, so a
column keeps its identity for the life of the archetype and its backing store
stays within about an eighth of the capacity. Numeric columns are seeded with a
fractional write so V8 keeps them as packed doubles from the start.

Only the aggregate `pair(relation, *)` is an archetype type. Concrete pairs live
outside archetypes in a `Store`, one per type id per world: a dense list of
holders, stamps, and data rows. Pair stores are also indexed by target for
cleanup, and every entity keeps one flat `[type, row]` list of the external
types it holds. Sparse traits use the same store kind. This is the one
deliberate departure from Iris. Putting concrete pairs into archetypes creates one
archetype per distinct target, and a JavaScript archetype costs kilobytes, so
ten thousand distinct targets retained about 93 MB against 11 MB with pair
stores. Wildcard queries on a relation stay static archetype lookups; queries
on a concrete pair start from that pair's store, which is usually the smallest
candidate set anyway.

### Sparse traits

`defineTrait(schema, { sparse: true })` stores a trait outside archetypes. The
option is kernel-only: the public `trait()` does not expose it, because no
workload has shown a trait that earns it and the benefit depends on how many
queries observe the trait, which users cannot see. It never enters a type
list, so adding or removing it moves nothing and creates no archetype, and it
is never copied when some other trait moves the entity. Each sparse trait owns
the same `Store` a concrete pair uses. This is the Flecs `DontFragment`
trait.

Queries name sparse traits as per-entity terms, the way concrete pairs work.
A query with a sparse term is dynamic: it starts from whichever side is
smaller, the sparse store's holders or the rows of the archetypes matched by
its other terms, and checks the remaining terms per entity. `not`, `or`,
`added`, `changed`, and `removed` all accept sparse traits. Observed queries
that name a sparse trait re-check the entity on each add and remove, so the
per-query cost that archetypes remove returns for exactly those queries.
The public query result does not read sparse data, since no public trait can
be sparse.

Labs on 2026-09-13, 10,000 entities, eight fresh blocks, sparse against the
same trait as an archetype tag: add and remove with no queries 1.03 ms
against 1.76 ms; with twenty observed queries 6.36 ms against 1.96 ms, about
27 ns per observed query per change; data set and get equal at 460 µs;
`collect` of `[Position, Flag]` with 1% holders 4 µs against 89 ns and with
50% holders 283 µs against 6 µs, since a sparse term evaluates per candidate
while an archetype term copies rows. So a trait
earns the flag when it changes often, few queries observe it, and it is not
the wide side of a large per-frame query. State flags are the usual case.
Data traits pay memory proportional to holders, since the store is dense.

An exclusive relation replaces its previous target before inserting the new
pair, and the aggregate only moves the entity when its first pair arrives or
its last pair leaves.

`createEntity` places the entity directly into the archetype of its trait
entries in one transition, and `addTraits` folds several additions into
one move. Observers of an earlier entry can see later entries already applied.

The per-world entity index is flat typed arrays indexed by entity index:
generation, archetype id, and row. There is no per-entity object. An
archetype keeps its stamps in two slot-major `Float64Array`s rather than one
pair of arrays per type.

## Queries

A filter is an include list and an exclude list with a live array of matching
archetypes, maintained when archetypes are created and destroyed. Filters are
registered under one included type, or under a global bucket when the include
list is empty, so Koota's empty and `not`-only queries are supported.

A query resolves its terms to filter branches, expanding `or` into disjoint
branches like Iris, plus tracking terms and relation-target terms evaluated per
entity at collection time. Results are snapshots. Live archetype visits are
available for static queries.

Queries are cached per world by a key derived from sorted term ids. A world may
carry default exclusions, which apply to every query including relation-target
subqueries.

### Change detection

Every mutation stamps the current revision into the archetype's `added` or
`changed` column. A module-level revision clock is shared by all worlds. A
tracker (`createTracker`) records its creation revision as a baseline. A
tracking query keeps one `reported` stamp per entity. An entity is reported when
every tracking term has an event stamp newer than both the query's `reported`
stamp for that entity and the term's tracker baseline, and the static terms match
the entity's current archetype. Reporting an entity sets its `reported` stamp and
advances the clock.

This differs from Iris, whose window is per system. Koota's tests require that an
entity's pending events survive reads until the entity itself is reported.

`removed` terms read a per-type map from entity to removal revision. Re-adding
the type deletes the entry, and destroyed entities are dropped when encountered.
Adding a trait without a value does not count as a change. Adding one with a
value does, because the value is applied as a set.

### Events

The kernel fires a fixed set of observer events synchronously after state is
consistent: `entityCreated`, `entityDestroying`, `entityDestroyed`,
`traitAdded`, `traitRemoving`, `traitChanged`, `archetypeCreated`,
`archetypeDestroyed`. Query add and remove subscriptions and query versions are
maintained only for observed queries by comparing filter membership of the
source and destination archetype on each transition. Queries with relation-target
terms keep an explicit member set while observed.

Re-entrant mutation from observers is allowed. Each operation re-validates its
inputs, and observers run after the operation's own state changes.

### Hooks

Hooks live on the definition, installed once with `setTraitHooks` before the
trait enters any archetype or pair store, and the kernel calls them from the
mutation path: `onAdd`, `onSet`, `onRemove`, and for relations
`onTargetDestroy`. This follows Flecs type hooks; Iris has none.

Adding a trait is a create followed by a set. Construction runs the schema
factories and defaults, `onAdd` edits that record before it commits, a
supplied value then goes through `onSet` and is written once, and only then do
observers hear about the add, followed by the change. Without hooks the
create and the value share one column pass. `onSet` on `setTrait` reads the
current record, merges the partial, runs the hook, and writes once, so a throw
leaves the previous value. `onRemove` runs after the `traitRemoving` observers
with the value readable. `onTargetDestroy` runs per source while the target is
readable; the pair is removed afterwards if the source still holds it, then the
`autoDestroy` policy applies.

The no-hook cost is one definition read per operation. Archetypes precompute
their remove hooks per type slot, so destroy pays one array read per trait. An
AoS instance supplied at add time is the constructed value; no throwaway
instance is built.

## The public API on top

`src/api` builds Koota's public surface on the kernel. Nothing in it reaches
into kernel records except through the `src/kernel` barrel.

**Entity handles.** Public handles are unique across worlds: the API leases
1,024-slot pages from a global pool and binds each slot to a kernel entity. A
deferred spawn, from a command buffer or from inside a mutation, reserves a
kernel entity and binds its handle at once, so later commands and relations can
name it while `isAlive` and `has` report it dead until the creation plays.
Reset retires reservations that never played and releases their handles.

**Hooks and subscriptions.** `trait().onAdd()`, `onSet()`, `onRemove()`, and
`relation().onTargetDestroy()` install kernel hooks on the definition through a
thin adapter that maps kernel identities to public handles via the kernel
world's `context` slot. Hook methods are not enumerable. Subscriptions use
kernel observers, which a world attaches on its first subscription, so a world
nobody observes pays nothing per mutation. Query add and remove subscribers
fire from the kernel after the move, so the observed order stays hooks,
observers, query.

**Mutation scopes.** The kernel owns deferral. Every kernel mutation opens a
scope (`world.depth`) around its immediate form and closes it when done; a
mutation issued while a scope is open, by a hook, an observer, or a caller that
opened one with `beginMutation`, queues in `world.queue` and plays in order when
the outermost scope closes, including commands queued during playback. The
queue is parallel arrays reused across flushes. A deferred `createEntity`
returns a reserved handle that reads as dead until its creation plays; a throw
discards the rest of the queue, retires unplayed reservations, and leaves
completed work in place. Pair commands snapshot the target handle at queue time
so a target recycled before playback is skipped. Immediate forms carry a `Now`
suffix and are for callers inside a scope of their own, which is how the
public layer applies a multi-trait add one trait at a time when subscribers
observe it, and how `world.flush` plays a buffer inside one scope so callback
work plays after the supplied commands. Spawn applies its entries in one
transition in both modes.

**Queries.** `createQuery` keys are hashed from trait ids, tracker ids, and
target handles, and each world resolves them lazily to a kernel query.
`updateEach` snapshots records, runs the callback, and writes changed fields
back through the columns; traits with an `onSet` hook, change subscribers, or
Changed trackers get change detection in `auto` mode. `getPages` returns one
page per archetype with the trait's columns and row indices.

**What changed for users.** `getStore` and `useStore` are gone: storage is per
archetype, and `getPages` is the column interface. Query iteration order
follows storage, not the order entities joined the query. A removed trait's
data is not readable from a `Removed` query. Deprecated `TraitInstance` and
`QueryInstance` types are gone, and `world.entity` no longer accepts a pair.
Hooks are chained on the definition instead of passed as an option; `onAdd`
sees schema defaults, and a value supplied at add time runs `onSet`, fires
`onChange`, and counts for `Changed`. Factories that declare a parameter
receive the entity, which replaced the internal ordered-list initializer.

Ordered relations keep an `order` list on each target's pair store: adds
append, removes splice, `getSources` and pair queries read it, and `setSources`
reorders it after checking the set is unchanged. Actions and world finalization are built on these primitives
without further kernel support.

## Cost model

Adding or removing a trait copies the entity's shared columns between
archetypes. Data columns cost 8 bytes per entity per numeric field and one
pointer per reference field. Stamp columns cost 16 bytes per entity per type.
Concrete pairs cost one store per distinct pair plus two numbers per entity pair.

## Measurements

Scratch runs on 2026-09-13, Apple M4 Pro, Node 24, 10,000 entities, median of
20 iterations in one process per variant. Retained rows come from one fresh
process per case. Iris is the reference checkout at `~/Dev/iris`. Treat these
as direction, not as a Labs report.

Kernel level, matched operations:

| Workload                                     | This kernel |    Iris |
| -------------------------------------------- | ----------: | ------: |
| Has scalar trait                         |       81 µs |   52 µs |
| Write and read fractional scalar             |      450 µs |  369 µs |
| Remove and reattach tag, no queries          |     1.23 ms | 2.00 ms |
| Remove and reattach tag, 20 observed queries |     1.36 ms | 2.00 ms |
| Copy cached query snapshot                   |       19 µs |   52 µs |
| Cold population with values, three scalars   |     2.70 ms | 2.48 ms |
| Compile and count 20 cold queries            |     1.49 ms | 2.36 ms |
| Remove and reattach shared pair              |     2.81 ms | 5.17 ms |
| Retained, three scalars                      |     1.46 MB | 2.29 MB |
| Retained, distinct relation target each      |     11.9 MB |  101 MB |

The snapshot copy row measured between 7 µs and 19 µs across sessions with no
kernel change in between, so read it as a bound, not a point. Cold population
supplies a value per trait, which now stamps a change per value; the set path
pays one definition read for its hook check.

Unobserved queries cost nothing on a transition. Observed static queries are
diffed as one bitset per archetype, so twenty subscribed queries add about ten
percent to a tag toggle.

Public API, current tree against the pre-rewrite tree at the same commit base:

| Workload                                     |  Before |   After |
| -------------------------------------------- | ------: | ------: |
| `entity.has`                                 |  175 µs |  247 µs |
| `entity.get(...).x`                          |  293 µs |  400 µs |
| `entity.set`                                 |  545 µs |  620 µs |
| Tag toggle, no queries                       | 1.48 ms | 2.43 ms |
| Tag toggle, 20 cached queries                | 7.84 ms | 2.44 ms |
| `updateEach` move, no listeners              |  636 µs |  960 µs |
| `updateEach` move, change listener           | 1.14 ms | 1.36 ms |
| `readEach`                                   |  267 µs |  484 µs |
| `world.query(Changed(...))`, nothing pending |  2.3 µs |  2.5 µs |
| `getPages` column loop                       |   63 µs |   40 µs |
| Spawn three traits and destroy               | 24.8 ms |  7.2 ms |
| Cold world, 10k spawns and 7 queries         | 9.35 ms | 5.00 ms |
| Retained, 10k entities with three scalars    | 2.53 MB | 1.49 MB |
| Retained, same plus 7 cached queries         | 4.56 MB | 1.47 MB |
| Retained, distinct relation target each      | 8.25 MB | 12.1 MB |
| Retained, scene graph 1k parents x 10        | 3.05 MB | 2.97 MB |

Per-entity calls pay for handle translation and the archetype move, so they run
1.3 to 1.8 times slower than before. Spawning, cold queries, many cached
queries, and memory improved by two to four times.
