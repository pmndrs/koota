A work in progress document for the architecture of Koota.

## Principles

Koota prioritizes ergonomics and simplicity over performance. Iteration speed, intuitive mental model and expressive API are a priority.

Complexity is hidden from the surface API, but available to users who need it. The onion layer approach. As users peel back the layers they can get lower level control and less ergonomic APIs meant for performance tuning.

Koota assumes the typical use will rely on dynamic trait changes and compositional behavior over stable large arrays that are iterated over. In other words, structural changes are expected to be frequent. See: [https://moonside.games/posts/archetypal-ecs-considered-harmful/](https://moonside.games/posts/archetypal-ecs-considered-harmful/)

The internal hot paths should avoid Maps and Sets where an SMI and array can work instead. SMIs allow for 32-bit masking and create no GC or heap allocation.

## Glossary

**Ref.** A stateless, global definition returned by factory functions (`trait()`, `relation()`, `createQuery()`, `createActions()`). Refs are world-agnostic and contain only definition data (schema, configuration) plus a unique ID for fast lookups. Users interact primarily with refs. Since the user is not aware of internals like instances and only see the ref, the ref type is usually named as the target concept, such as `Trait` or `Query`.

**Instance.** Per-world state created from a ref. Contains world-specific data like stores, subscriptions, query results, and bitmasks. Examples: `TraitInstance`, `QueryInstance`. Instances are internal — users don't interact with them directly.

**Record.** The per-entity result of reading a trait. It differs by storage type

- SoA: A snapshot of the entity state.
- AoS: The value stored for the entity, likely an object ref.
- Tag: `undefined`, since there is no store.

**Register.** The process of creating an instance for a ref on a world. Happens lazily on first use. Allocates storage, sets up bitmasks, and integrates with the world's query system.

**Create.** The verb used for all factory functions. `create`_ functions return refs (`createQuery`, `createActions`, `createAdded`) or instances (`createWorld`). The primitives `trait()` and `relation()` omit the verb for brevity. We used to use `define`_ to differentiate creating a ref and creating an instance, but we now juse use `create` in all cases and try to make this process hidden from the user.

**World.** The context that holds all per-world state. Contains storage, trait instances, query instances, action instances, and manages the lifecycle of data changes.

**Schema.** The shape definition for trait data. Can be SoA (struct of arrays), AoS (array of structs via factory function), or empty (tag trait).

**Store.** The actual per-world storage for trait data, created from a schema. SoA stores have one array per property; AoS stores have one array of objects.

**Relation.** A directional connection between entities. The **source** is the entity that owns the relation, the **target** is the entity it points to. In `child.add(ChildOf(parent))`, child is the source and parent is the target.

**Pair.** A pair is of a trait and target entity `(trait, targetEntity)`. Relations produce pairs.

**OrderedRelation.** A trait added to the **target** entity that stores a mutable ordered view of all entities with a relation pointing to it. The list and relation stay in sync bidirectionally. Modifying the list updates the relation pairs, and modifying the relation updates the list.

## Definitions

Koota allows for many worlds. To make this experience simple there are global, stateless **refs** that get lazily **instantiated** on a world whenever it is used. Examples of this are:

- Traits
- Relations
- Queries
- Actions
- Tracking modifiers

A world is the context and holds the underlying storage, manages entities and the general lifecycle for data changes. Refs get instantiated on a world and use the id as a key for its instance.

Traits are a user-facing handle for storage. The user never interacts with stores directly and instead deals with the mental model of traits -- composable pieces of semantic data.

`createWorld(options?: WorldOptions)` fixes world policy at creation. `retain` defaults to 1024, is readable through `world.retain`, and survives reset. It caps destroyed-entity history. Overflow evicts the oldest even if unread, and zero disables retention. Singleton traits are added separately with `world.add(...)`.

A world owns everything it allocates and nothing outside refers to it, so dropping the last reference frees it. `createWorld()` creates the world entity at once. `destroy()` is final: it destroys every entity, releases the pages and leaves a world that cannot spawn.

## Internals

Each trait instance has a bitflag and a generation ID per world. An entity builds a bitmask representing all of the traits it has. A query has its own bitmask representing the traits that define is archetype. Queries compare its bitmask against an entity to know if it belongs in the archetype.

Pairs cannot be represented in the bitmask of an entity of query, only the base relation, and therefore are not captured in that comparison. This especially effects change and forbidden masking.

An entity is a packed number, `generation(8) + entityId(24)`, that only means something to the world that spawned it. Two worlds hand out the same numbers, so entity operations go through the world: `world.get(entity, Position)`. The packed generation protects against stale recycled handles.

Each world owns its page allocator and its entity index, and ids start at zero. The `koota/entity-methods` entry is the exception. Its `createWorld` shares one allocator between its worlds, so the page of an id identifies the owning world and `entity.get(Position)` can find it. That table holds each of those worlds until it is destroyed. A program uses that entry for all of its worlds or for none.

Most per-entity state is paged. Bitmasks, trait stores, relation targets, and tracking snapshots use page-based arrays keyed by `pageId = entityId >>> 10` and `offset = entityId & 1023`. Mask and tracker tables cover the pages the world has leased and grow when it leases another, so a small world stays small.

Entity allocation is handled by a page allocator plus a per-world entity index:

- The allocator owns page generations, page ownership and free pages.
- Each world owns a dense index partitioned into alive, reusable and retained entries, a sparse lookup, and per-page cursors for fresh allocation.
- Destroyed data stays available to `Removed` query iteration in a FIFO capped by `retain`. Ordinary entity reads require a live entity. Eviction clears history and stored references, bumps the generation, and moves the slot into the reusable region of the dense index. Allocation takes reusable slots without scanning.

Internals use `WorldContext`, the actual context, instead of the `World` handle. World methods read it from their closure, which avoids `world[$internal]` lookups in hot paths, and entity methods resolve it from page ownership.

### Structural Changes

Structural changes are updates that change the structure and layout of memory as opposed to mutations which update values in memory.

See [structural.md](./structural.md) for detailed code path documentation.

### Trait Accessors

Traits use core-owned paged SoA or AoS storage. `createTraitContext` allows overrides of `add`, `get`, `set`, and `remove` typed to the schema, with default accessors for delegation.

Accessors own values and auxiliary indexes. The core owns membership, queries, revisions, and events. `set` returns whether it changed the value.

This is a type-time contract. Accessors preserve invariants and handle failures. Raw writes bypass hooks. Defer removal or replacement of selected custom traits until query iteration finishes.

### Queries

Calling `world.query(...)` hashes the parameters, retrieves or creates a cached `QueryInstance`, and returns a live `QueryView` over the instance's incrementally-maintained entity set.

See [query.md](./query.md) for detailed code path documentation.

### Assertions

There is an assertion layer that can be compiled in or out that validates design contracts are held at runtime. This is a compositional layer.
