# Entity kernel

The production kernel gives ordinary entities, trait definitions, relation definitions, and interned relation pairs identities from the existing global paged allocator. Shared callable traits are schema blueprints for the public API. Registering one creates a context-owned definition entity. Native operations use numeric predicate identities directly.

A definition can carry traits and serve as a relation target. Pairs can carry traits and be targets of further pairs. Any ordinary entity can become a tag. Relation policies and schemas are defined at creation. A relation endpoint must be a relation definition. A bare relation predicate supports presence queries and removing all targets. Attachments and data access require a concrete pair, so relation data cannot be confused with an ordinary entity row.

```ts
const ctx = createKernelContext()
initializeKernel(ctx)
const Position = defineTrait(ctx, { x: 0, y: 0 })
const Label = defineTrait(ctx, { text: '' })
const References = defineRelation(ctx)
attachEntity(ctx, Position, Label, { text: 'Position' })

reserveKernel(ctx, 10_000, 30_000)
const entity = tryCreateEntity(ctx)
if (entity >= 0) tryAttachEntity(ctx, entity, Position)
const pair = pairEntity(ctx, References, Position)
attachEntity(ctx, entity, pair)
```

Create and expose definitions, intern pairs, compile queries, and reserve storage before entering a bounded loop. Explicit native definition, promotion, exposure, and pair-interning calls during a mutation or lifecycle callback throw before changing the entity graph. Convenience descriptor operations can register implicit definitions and pairs during their controlled playback. Pair interning is a creation operation. Unused pairs remain interned until the pair or an endpoint is destroyed.

## Identity and lifetime

Handles use 22 index bits and 8 generation bits. They remain in `[0, 2^30)`, with up to 4,194,304 slots shared across contexts. Zero is a valid entity. Negative values are status sentinels.

Generation exhaustion retires a slot instead of wrapping. Recycled handles cannot regain validity. The allocator stores generation and liveness together in each slot, with page ownership checked during validation. Releasing a page advances its generations too. A context owns its pages, so a handle from another context cannot act as a local subject or predicate.

Destroying a definition removes it from its users. Destroying a relation or target invalidates its dependent pair entities, including nested pairs. Explicitly destroying an interned pair removes its memberships. Ordinary sources survive unless the relation's destruction policy requests otherwise.

Implicit definitions stay out of ordinary entity enumeration and queries. `resolveDefinition`, `pairEntity`, and public `world.entity(...)` expose identities to normal queries. This keeps registering a schema from silently adding results to existing application queries. `getKernelEntities(ctx, true)` includes implicit identities.

Public schema blueprints can be registered again after their definition is destroyed. Numeric handles and numeric queries keep their original identity and never follow that replacement. Context-local schema and compiled query metadata stay cached until context reset or destruction. Deleting a definition does not compact mask generations or unregister its public schema blueprint.

## Storage

The global store continues to lease 1,024-slot pages to contexts. Entity addressing, generation pages, ownership, and paged component columns remain the storage strategy. The reverse entity-to-row lookup also uses 1,024-slot integer pages, avoiding a holey plain array spanning unrelated contexts. Definitions and pairs use this same store. Adding a trait updates membership and masks without moving the entity or copying its other component rows. There is no production archetype storage or archetype membership table.

Memberships are integer edges in a flat pool, linked by subject and predicate. An integer hash table provides exact membership lookup. Removal unlinks both directions and recycles the slot. No `Set` is created for an ordinary entity.

Predicate classification shares the allocator's existing lifetime word. Bits 0–7 hold the generation, 256 marks a live slot, 512 marks retirement, 1024 identifies a concrete pair, and 2048 identifies a trait or relation definition. Lifetime checks mask out classification. Numeric pair presence checks use that same validated word before probing membership, with no predicate-record lookup.

Each predicate has one execution record containing its schema, mask and column references. The record also serves as prepared access, and a pair record serves as its relation descriptor. Numeric reads and writes resolve this record directly from a descriptor page and call the prepared operations. Ordinary trait presence uses its mask and data uses the entity slot. Concrete pair data uses the membership row.

Each context preallocates a directory covering all 4,096 entity pages. Registering a definition or pair prepares a 1,024-entry page of descriptor references when needed. A raw slot selects its page and offset, and checked access validates the full handle against the record. All definitions and pairs follow the same path, including observed writes. Removal clears the reference without moving another descriptor. Empty pages remain available until reset. The record object, entity identity, and component columns stay stable. This trades additional pointer storage for faster repeated numeric access. See the [descriptor directory measurements](descriptor-directory-results.md) for the selected layout and its memory cost.

Relation pairs are interned entities. A relation membership uses its edge slot as the data row. Relation data no longer needs a separate target-indexed array inside every source and field. Reverse membership links let deletion visit users without copying buckets or searching a reverse array.

Integer edge columns use typed arrays for predictable footprint. Numeric schema columns use packed plain double arrays, with 1,024 values allocated per page. Reference columns use packed plain arrays. Scalar defaults write straight into the columns, without constructing and merging default records. Factories run only for fields without a supplied value. Removed reference values are cleared so unused rows do not retain application objects.

## Bounded operations

Prepared access, lazy query plans, borrowed columns, and bulk spawning are described in [prepared execution](prepared-execution.md). They preserve paged storage and add explicit batch publication policies.

`reserveKernel(ctx, entities, memberships)` reserves at least the requested capacity and prepares registered data columns, masks, and existing query indexes. Define and intern first, then reserve. Registering more schemas, queries, or tracking cursors afterward can require another preparation pass.

- `tryCreateEntity` returns a handle, `-1` when the prepared identity pool is exhausted, or `-2` during nested mutation. It never leases a page.
- `tryAttachEntity` returns `1` when added, `0` when already present, `-1` when membership capacity is exhausted, or `-2` for invalid or unprepared predicates or nested mutation. It checks the space for the relation and pair together.
- `collectQueryInto` copies into caller storage and returns the required count. It never grows the output. Tracking results are consumed only when the output fits the complete result.
- `visitQuery` borrows the cached entity array during a synchronous callback. It passes the live count, invokes no callback for an empty result, and rejects tracking queries. Structural edits are deferred until the outer visit completes. Nested visits are safe, and a thrown callback discards queued edits. Do not retain or mutate the borrowed array.
- `readEntityValues` writes fields in schema order, up to output capacity, and returns the required field count. An absent trait returns `-1`.
- `writeEntityValues` requires a complete input row and returns false before writing if the input is too short, the identity is invalid, or the call is nested inside another mutation. Writes during `visitQuery` are allowed. AoS uses one reference slot. Use a plain array for references and a numeric buffer for numeric schemas.

User factories, hooks, observers, tracking histories, and deferred payload snapshots may allocate. Tracking histories can exceed the live entity capacity. The public convenience operations can grow capacity and create immutable snapshots. These are distinct from the prepared primitive paths. Caller workspaces belong to their caller, including nested or worker code.

No tolerance or geometric epsilon applies to this kernel. Integer identities and membership are exact. NaN and fractional data are preserved in numeric columns. Empty queries match exposed live entities. Tags have zero fields. Empty outputs report the required count without writing. Query order is unspecified unless the caller sorts a snapshot.

## Queries and notifications

Cached queries retain dense full entity handles. Their membership indexes start as capacity-managed hash tables. Reservation can select a paged integer row index when its estimated footprint is smaller. The page index uses the global slot and validates the full handle against the dense row, preserving generation checks. Query creation, reservation, and new entity pages prepare index storage. Growing page coverage can switch the index back to hashing. Membership changes still update caches immediately, and snapshots already returned to callers stay unchanged.

Tracking cursors present at context initialization share one history with the same starting snapshot. Cursors created later own separate histories. Queries keep independent consumption trackers. Mutations update each distinct history once, retaining initial Added, Removed, and Changed behavior without duplicating the default histories. See [scalar access measurements](scalar-access-results.md) for this optimization and the shorter typed-buffer write path.

Each trait keeps its non-tracking query dependencies in a packed reference array with an explicit count. Single-generation static queries reuse the mask loaded by a structural mutation. Numeric query predicate lifetimes are validated during compilation and invalidated when a referenced definition or pair is destroyed. Public blueprint queries retain their existing replacement behavior. Tracking groups, relation filters, versions, and notification boundaries retain their semantics. See the [eager-query results](eager-query-results.md) for measurements and regression coverage.

Command buffers retain their word and payload capacity and use an explicit command count. Clearing releases payload references without discarding the backing arrays. Two context-owned pending buffers alternate during hook-driven mutation playback. Deferred numeric operations retain the original predicate handle and revalidate its generation before execution. Commands targeting a destroyed predicate are skipped, and queued edits can address a reserved spawn in playback order. Query notifications use parallel arrays and an explicit count instead of allocating a tuple for each notification.

Query descriptors are immutable after construction. Structured terms are interned separately from plain trait IDs, so relation targets cannot collide with modifiers or other relation IDs. Recursive filters own their hash workspace. Reused descriptors avoid rebuilding those terms, and compiled query handles bypass hashing during execution.

The archetype comparison lives in `packages/core/src/kernel/benches/experiments/archetypes`. It measures a bounded, paged tag graph with cached transitions against the production query cache. It is a standalone experiment and has no production imports or integration. Its movement timings omit hooks, tracking, relation policies, membership edges, and schema data, so they are not a production speedup claim. Any future signature graph must cache search decisions only, with a measured benefit. It must preserve the paged store and avoid moving entities between signature tables.

## Measurement

Production baseline: `kernel-production-before`. See [measurements and limitations](entity-kernel-benchmarks.md). Timing comparisons use Labs fresh-process blocks. Retained-memory measurements include both V8 heap and ArrayBuffer backing stores after full GC. Public snapshot allocation and retained kernel storage are reported separately.
