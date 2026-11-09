# Query

## Query Resolution

How `world.query(...)` resolves inline trait refs into a result.

### Trait ref params

This is the most common path. The user passes trait refs directly as arguments.

```
world.query(Position, Velocity)
```

### Flow

```mermaid
flowchart TD
    A["world.query(Position, Velocity)"] --> B[Ensure world registered]
    B --> C[Compute hash from params]
    C --> D{Cached instance?}
    D -- hit --> E[Run query]
    D -- miss --> F[Create & populate instance]
    F --> G[Cache instance]
    G --> E
    E --> H[Flush pending removals]
    H --> I[Snapshot matching entities]
    I --> J["Return the live QueryView"]
```

### Steps

**1. Query**

```ts
world.query(Position, Velocity)
```

Trait refs are passed as arguments to `world.query`. Each ref carries a stable numeric ID used for hashing.

**2. Ensure world registered**

```ts
const ctx = world[$internal]
ensureWorldRegistered(ctx, world, id)
```

Querying is also a registration point. If the world has not been used yet, this step registers it, initializes tracking masks, and creates the world entity.

**3. Compute hash**

```ts
const hash = createQueryHash(params)
```

Trait IDs are sorted and joined into a canonical string key. Parameter order doesn't matter — `query(A, B)` and `query(B, A)` produce the same hash.

**4. Get cached instance**

```ts
let query = ctx.queriesHashMap.get(hash)

if (!query) {
  query = createQueryInstance(ctx, params)
  ctx.queriesHashMap.set(hash, query)
}
```

The hash looks up an existing `QueryInstance`. On a miss a new instance is created: it processes the parameters, builds bitmasks, and populates matching entities via bitmask checks against all live entities. The instance is then cached for future calls.

**5. Run**

```ts
query.run(ctx, params)
```

Flushes any deferred removals, then snapshots the instance's entity set. For tracking queries (e.g. `Added`, `Removed`, `Changed`) the set is cleared and bitmasks reset so changes can accumulate again before the next call.

**6. Return result**

```ts
return bindQueryView(ctx, query, params)
```

The caller receives a `QueryView`, a live view over the instance's entity set with methods for iterating with trait data. The view is cached per ordered trait and target projection, so a run allocates nothing.

## Target projection

Matching and projection are separate. A binding keeps trait stores for record access and one ordered projection list containing data traits and relation storage instances. That list supplies callback order, binding comparison and iterator cache keys. Required wildcards project their backing slot, which holds one entity for exclusive relations or the target array otherwise. Exclusive target-query pairs project the same slot. Other pairs remain filters.

The generated positional iterator hoists the target storage references outside the entity loop and reads each selected slot into a callback argument. Non-exclusive slots are copied into reusable arrays before the callback. When trait cursors already track page changes, target pages share that page switch. The relation policy is resolved at compilation, without a per-entity policy branch or target lookup call. Unselected targets generate no reads or copies. Trait-only iterators keep their existing loop bodies.

`targetsFor` retains its snapshot behavior. Arrays passed to `each` are reusable read-only snapshots. The iteration-buffer pool owns one array per non-exclusive projection and active walk, so structural commands and nested walks cannot alter the current callback's snapshot. Arrays are reused for later rows and calls. Callers must preserve selected membership until a row is visited. Legacy state-array iterators and page stores continue to expose trait data only.

### Validation and performance

`query-relation-targets.test.ts` covers callback order and tracking, snapshot stability, buffer reuse, selection,
query references, excluded pairs, legacy layouts, derived views, world isolation and widened types.
Explicit-schema inference is checked alongside the exclusive and non-exclusive behavior tests.

`query-relation-inline.bench.ts` keeps ten cases. One exclusive relation measures unused,
selected and consumed targets. Non-exclusive relations measure consumed and unused snapshots, including 32 targets to expose copy cost.
Three relations cover unused argument scaling and consuming multiple arrays on scattered pages.
A plain-trait control checks unrelated iteration, and a concrete lookup with target selection
checks iterator reuse for views outside cached queries. Existing `query-api` benchmarks cover
warm inline lookup costs, including target-query filters.

The fixture generates literal relation arguments and detects the callback shape through a separate
binding before timing. Timed runs perform `world.query(...).each(...)`. Results are checked against
independent expected values outside timing. Arrays passed to callbacks are consumed directly.

```sh
pnpm bench --against ../koota-relation-each-canary '@relation-each-inline' --blocks 6 -n relation-each-snapshots
```

The six-block comparison against canary `1e0d99a7`, using the assertion-free build on Node 24.14.0
and an Apple M4 Pro, is saved locally as `relation-each-snapshots`. Consuming a two-target snapshot
improves from 134.85 to 48.57 microseconds per 10,000 entities, and consuming three such snapshots
improves from 404.04 to 141.25 microseconds. Unused two-target snapshots add about 2.7 ns per entity
versus canary, growing to 27 ns with 32 targets. Selection and plain-trait controls show no detected
slowdown. Exclusive targets retain their direct-read performance.

The separate `relation-each-snapshot-cost` comparison against the borrowed-array implementation
at `edad709f` isolates the copy cost. Consuming one two-target array rises from 33.55 to 50.36
microseconds per 10,000 entities, and an unused array rises from 24.64 to 46.11 microseconds.
Snapshot cost grows with the number of targets. Warm inline queries still use the existing
parameter-identity cache and skip hashing.

### Inlining

Measured bytecode on Node 24.14.0, using the emitted bundle and generated iterators:

| Function or iterator                        | Bytes |
| ------------------------------------------- | ----- |
| Plain trait or targets excluded with select | 185   |
| One trait and one exclusive target          | 214   |
| One trait and one target array              | 243   |
| One trait and three target arrays           | 354   |
| Three target arrays without trait records   | 284   |
| Tracked trait and three target arrays       | 436   |
| Buffer preparation                          | 424   |
| Target snapshot copy                        | 53    |

These paths fit the 460-byte per-function budget. V8's `--trace-turbo-inlining` confirmed that
the snapshot copy helper and small callbacks inline into the generated loops. Exclusive targets
keep their direct slot reads. Trait-only and selected iteration bytecode is unchanged.

## Important details

- Query instances are cached two ways: by canonical hash in `ctx.queriesHashMap`, and for pre-built query refs by numeric `queryRef.id` in `ctx.queryInstances`. The second path avoids recomputing the same hash lookup for shared query refs.
- Query matching is incremental after creation. Structural changes do not rebuild every query from scratch; they update only the queries affected by the touched trait or relation.

## Fast paths

- A shared query ref created ahead of time can resolve directly through `queryRef.id`.
- A single relation pair with a specific target can skip the general query pipeline and use the relation reverse lookup path directly.

## Tracking queries

Tracking modifiers such as `Added`, `Removed`, and `Changed` build on the same query cache, but they also maintain paged tracking masks and snapshots.

- They use paged tracking masks and snapshots.
- After `query.run(...)`, they clear transient results and reset tracking state.

## Relation filters

Base trait/relation matching is bitmask-driven, but relation pairs are not fully representable in the entity mask, so target-specific filtering is applied as an extra step.
