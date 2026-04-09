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

**OrderedRelation.** A trait added to the **target** entity that stores an ordered list of all entities with a relation pointing to it. The list and relation stay in sync bidirectionally. Modifying the list updates the relation pairs, and modifying the relation updates the list.

## Definitions

Koota allows for many worlds. To make this experience simple there are global, stateless **refs** that get lazily **instantiated** on a world whenever it is used. Examples of this are:

- Traits
- Relations
- Queries
- Actions
- Tracking modifiers

A world is the context and holds the underlying storage, manages entities and the general lifecycle for data changes. Refs get instantiated on a world and use the id as a key for its instance.

Traits are a user-facing handle for storage. The user never interacts with stores directly and instead deals with the mental model of traits -- composable pieces of semantic data.

Worlds are **lazily registered** with the global universe. `createWorld()` allocates the facade and internal state, but it does not enter the global universe until first use (`spawn`, `add`, `set`, `query`, hook registration). This keeps world creation cheap and makes React-style memoized world creation safer.

## Internals

Each trait instance has a bitflag and a generation ID per world. An entity builds a bitmask representing all of the traits it has. A query has its own bitmask representing the traits that define is archetype. Queries compare its bitmask against an entity to know if it belongs in the archetype.

Pairs cannot be represented in the bitmask of an entity of query, only the base relation, and therefore are not captured in that comparison. This especially effects change and forbidden masking.

The runtime stores entity identity globally instead of encoding `worldId` into the entity value. Packed entities are now `generation(8) + entityId(24)`. The world/context for an entity is resolved from global page ownership using the entity ID's page, while the packed generation still protects against stale recycled handles.

A single entity index is held for **all** worlds in a global universe. This means worlds share a single entity limit. Entities are allocated to worlds per-page.

Along with this, most per-entity state is paged. Bitmasks, trait stores, relation targets, and tracking snapshots use page-based arrays keyed by `pageId = entityId >>> 10` and `offset = entityId & 1023`. This keeps large sparse worlds from paying for giant flat arrays and improves locality when entities from the same world are iterated together.

Entity allocation is handled by a global page allocator plus a per-world entity index:

- The global allocator owns page generations, page ownership, free pages, and empty-page reclamation.
- Each world owns a dense alive prefix, sparse lookup, and per-page cursors for fresh allocation.
- Destroying an entity bumps generation and leaves behind a recyclable dead slot, so reuse is fast without scanning for holes.

Internals use `WorldInternal`, the actual context, instead of `World` handle. That avoids repeated `world[$internal]` lookups in hot paths and lets entity convenience methods resolve context directly from page ownership. In addition, this means that the world context can be held onto while letting the the world handle get garbage collected, allowing us to free global resources in response.

### Structural Changes

Structural changes are updates that change the structure and layout of memory as opposed to mutations which update values in memory.

See [structural.md](./structural.md) for detailed code path documentation.

### Queries

Calling `world.query(...)` hashes the parameters, retrieves or creates a cached `QueryInstance`, and returns a fresh `QueryResult` built from the instance's incrementally-maintained entity set.

See [query.md](./query.md) for detailed code path documentation.
