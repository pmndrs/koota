A work in progress document for the architecture of Koota.

## Principles

Koota prioritizes ergonomics and simplicity over performance. Iteration speed, intuitive mental model and expressive API are a priority.

Complexity is hidden from the surface API, but available to users who need it. The onion layer approach. As users peel back the layers they can get lower level control and less ergonomic APIs meant for performance tuning.

Koota assumes the typical use will rely on dynamic trait changes and compositional behavior over stable large arrays that are iterated over. In other words, structural changes are expected to be frequent. See: https://moonside.games/posts/archetypal-ecs-considered-harmful/

The internal hot paths should avoid Maps and Sets where an SMI and array can work instead. SMIs allow for 32-bit masking and create no GC or heap access.

## Glossary

**Ref.** A stateless, global definition returned by factory functions (`trait()`, `relation()`, `createQuery()`, `createActions()`). Refs are world-agnostic and contain only definition data (schema, configuration) plus a unique ID for fast lookups. Users interact primarily with refs. Since the user is not aware of internals like instances and only see the ref, the ref type is usually named as the target concept, such as `Trait` or `Query`.

**Instance.** Per-world state created from a ref. Contains world-specific data like stores, subscriptions, query results, and bitmasks. Examples: `TraitInstance`, `QueryInstance`. Instances are internal — users don't interact with them directly.

**Record.** The per-entity result of reading a trait. It differs by storage type

- SoA: A snapshot of the entity state.
- AoS: The value stored for the entity, likely an object ref.
- Tag: `undefined`, since there is no store.

**Register.** The process of creating an instance for a ref on a world. Happens lazily on first use. Allocates storage, sets up bitmasks, and integrates with the world's query system.

**Create.** The verb used for all factory functions. `create`_ functions return refs (`createQuery`, `createActions`, `createAdded`) or instances (`createWorld`). The primitives `trait()` and `relation()` omit the verb for brevity. We used to use `define`_ to differentiate creating a ref and creating an instance, but we now juse use `create`\* in all cases and try to make this process hidden from the user.

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

## Internals

### Dual Membership System

Each trait instance maintains two parallel membership records for compatibility, until the library is entirely migrated to use HiSparseBitsets

| Record                           | Data structure             | Purpose                                                         |
| -------------------------------- | -------------------------- | --------------------------------------------------------------- |
| `entityMasks[generationId][eid]` | Dense `number[][]` bitmask | Legacy path — used by `hasTrait()`                              |
| `instance.bitSet`                | `HiSparseBitSet` per trait | Primary path — used by query matching, population, and tracking |

When a trait is added to an entity, both records are updated:

```ts
ctx.entityMasks[generationId][eid] |= bitflag // legacy bitmask
instance.bitSet.insert(eid) // hierarchical sparse bitset
```

The `HiSparseBitSet` is a 3-level hierarchical sparse bitset that decomposes a 20-bit entity ID into four 5-bit fields, enabling O(1) membership checks and sublinear multi-set intersection via top-down pruning. See [hi-sparse-bitset.md](./hi-sparse-bitset.md) for the full data structure specification.

### Entity Bitmasks (Legacy)

Each trait instance has a bitflag and a generation ID per world. An entity builds a bitmask representing all of the traits it has via `entityMasks[generationId][eid] |= bitflag`. When 32 traits fill a generation, a new generation is created.

This system is still maintained for backward compatibility (`hasTrait()` reads it) but is **no longer used** by the query matching hot path (`checkQuery`, `checkQueryTracking`) or query population.

### BitSet-Based Query Matching

Query matching uses per-trait `bitSet.has(eid)` — an O(1) sparse-array lookup with no generation loop or bitmask aggregation:

```ts
// Required — ALL must be present
for (let i = 0; i < required.length; i++) {
  if (!required[i].bitSet.has(eid)) return false
}

// Forbidden — NONE must be present
for (let i = 0; i < forbidden.length; i++) {
  if (forbidden[i].bitSet.has(eid)) return false
}
```

Initial query population uses `forEachQuery(requiredSets, forbiddenSets, callback)` — a hierarchical intersection that prunes entire subtrees of the entity ID space at L0 (32K IDs) and L1 (1K IDs) before touching individual L2 data words.

### Tracking System

Tracking modifiers (`Added`, `Removed`, `Changed`) use per-trait `HiSparseBitSet` maps:

```ts
addedBitSets: Map<trackingId, Map<traitId, HiSparseBitSet>>
removedBitSets: Map<trackingId, Map<traitId, HiSparseBitSet>>
changedBitSets: Map<trackingId, Map<traitId, HiSparseBitSet>>
```

These are sparse — only entities that actually experience events consume memory. Tracking snapshots use `bitSet.clone()` instead of `structuredClone(entityMasks)`, and per-query tracker state uses `TrackingGroup.trackerBitSets: HiSparseBitSet[]` instead of dense `number[][]` arrays.

### Pairs

Pairs cannot be represented in the bitset of an entity or query, only the base relation, and therefore are not captured in bitset intersection. Pair membership uses a separate `entityPairIds[eid][pairId]` sparse array for O(1) lookup.

### Structural Changes

Structural changes are updates that change the structure and layout of memory as opposed to mutations which update values in memory.

See [structural.md](./structural.md) for detailed code path documentation.

### Queries

Calling `world.query(...)` hashes the parameters, retrieves or creates a cached `QueryInstance`, and returns a fresh `QueryResult` built from the instance's incrementally-maintained entity set.

See [query.md](./query.md) for detailed code path documentation.

### HiSparseBitSet

The hierarchical sparse bitset is the core data structure enabling sublinear query population and O(1) per-trait membership checks.

See [hi-sparse-bitset.md](./hi-sparse-bitset.md) for the full data structure specification.
