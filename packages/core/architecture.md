A work in progress document for the architecture of Koota.

Koota allows for many worlds. To make this experience simple there are global, stateless **refs** that get lazily **instantiated** on a world whenever it is used. Examples of this are:

- Traits
- Relations
- Queries
- Actions
- Tracking modifiers

A world is the context and holds the underlying storage, manages entities and the general lifecycle for data changes. Refs get instantiated on a world and use the id as a key for its instance.

Traits are a user-facing handle for storage. The user never interacts with stores directly and isntead deals with the mental model of traits -- composable pieces of semantic data.

## Glossary

**Ref.** A stateless, global definition returned by factory functions (`trait()`, `relation()`, `createQuery()`, `createActions()`). Refs are world-agnostic and contain only definition data (schema, configuration) plus a unique ID for fast lookups. Users interact primarily with refs. Since the user is not aware of internals like instances and only see the ref, the ref type is usually named as the target concept, such as `Trait` or `Query`.

**Instance.** Per-world state created from a ref. Contains world-specific data like stores, subscriptions, query results, and bitmasks. Examples: `TraitInstance`, `QueryInstance`. Instances are internal — users don't interact with them directly.

**Record.** The per-entity result of reading a trait. It differs by storage type

- SoA: A snapshot of the entity state.
- AoS: The value stored for the entity, likely an object ref.
- Tag: `undefined`, since there is no store.

**Register.** The process of creating an instance for a ref on a world. Happens lazily on first use. Allocates storage, sets up bitmasks, and integrates with the world's query system.

**Create.** The verb used for all factory functions. `create*` functions return refs (`createQuery`, `createActions`, `createAdded`) or instances (`createWorld`). The primitives `trait()` and `relation()` omit the verb for brevity. We used to use `define*` to differentiate creating a ref and creating an instance, but we now juse use `create*` in all cases and try to make this process hidden from the user.

**World.** The context that holds all per-world state. Contains storage, trait instances, query instances, action instances, and manages the lifecycle of data changes.

**Schema.** The shape definition for trait data. Can be SoA (struct of arrays), AoS (array of structs via factory function), or empty (tag trait).

**Store.** The actual per-world storage for trait data, created from a schema. SoA stores have one array per property; AoS stores have one array of objects.

**Relation.** A directional connection between entities. The relation is the **predicate** and the target is the **subject**.

**OrderedRelation.** A trait bound to a relation that stores an ordered list of entities as its record. For a given entity, the list contains all entities that have the relation pointing to it. The list and relation stay in sync bidirectionally -- modifying the list updates the relation pairs, and modifying the relation updates the list.
