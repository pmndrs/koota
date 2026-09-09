# Iris comparison

This records the original comparison. The subsequent [prepared execution results](prepared-execution-results.md) implement and measure prepared access, indexed discovery, lazy query plans, batch publication, and bulk spawning.

Iris is a useful reference for fast scalar access and indexed query discovery. It is not uniformly leaner. Koota's prepared mutations allocate much less, and its paged relation storage avoids a large memory cost when subjects have different targets. Keep the global paged allocator and entity-valued definitions and pairs. The next optimization targets should be query candidate selection, prepared data access, and query cache maintenance.

This comparison leaves production code and the kernel contract unchanged.

## Measurement

The reference is the clean `/Users/krisbaumgartner/Dev/iris` checkout at commit `001e47c93705d35612a70cd827761c4e5cac31f4`, package `iris-ecs` 0.0.14. Both engines run from TypeScript source through the same Labs 0.9.0 workers on Node 26.1.0, Apple M4 Pro. Iris numeric fields use `Type.f64()` to match Koota's double precision.

Each timing has eight fresh-process blocks. Tables report the median of block medians. Allocation is Labs p50 bytes for the entire batch, including backing stores. Retained storage is measured separately after full GC in eight fresh processes per engine and workload. Source hashes, block distributions, snapshots and allocation samples are preserved in [comparison-results.json](../../../benches/kernel-iris/comparison-results.json) and [retained-results.json](../../../benches/kernel-iris/retained-results.json).

Definitions, population, query compilation and capacity preparation are outside warm measurements. Callbacks and output buffers are reused. No user observers, lifecycle hooks, tracking queries or scheduler systems are installed. Both normal write paths still execute their built-in change-publication machinery. Matching checksums and membership assertions validate every timing case.

These are matched valid-input workflows, not identical contracts. Koota additionally validates predicate lifetime and global ownership, uses bounded attachment statuses, and supports deferred structural edits during borrowed iteration. Iris uses revision stamps and archetype observers. Timings exclude the harness's forced GC pauses, so allocation figures matter when assessing sustained performance.

## Comparable workflows

Unless stated otherwise, each invocation processes 10,000 ordinary entities. Scalar and mutation fixtures contain one scalar component and one tag. The 20-query fixture contains one scalar and six tags, with 20 distinct conjunctions all affected by the toggled tag.

| Workflow                                                      |     Koota |      Iris | Allocation, Koota / Iris |
| ------------------------------------------------------------- | --------: | --------: | -----------------------: |
| Has scalar component                                          | 117.81 µs |  62.67 µs |            152 B / 152 B |
| Write and read fractional scalar                              | 651.46 µs | 311.65 µs |         152 B / 320.2 kB |
| Remove and reattach tag, no queries                           |   2.25 ms |   2.09 ms |          152 B / 1.52 MB |
| Remove and reattach tag, 20 queries                           |  22.72 ms |   4.38 ms |          200 B / 1.52 MB |
| Remove and reattach shared pair                               |   4.56 ms |   5.46 ms |          200 B / 2.96 MB |
| Copy cached query into caller buffer                          |   3.58 µs |  13.02 µs |            1.5 B / 152 B |
| Cold context preparation and population, three scalars        |   4.15 ms |   1.52 ms |        3.34 MB / 2.56 MB |
| Compile and count 20 cold queries, 100 matches each among 10k |   6.26 ms |  79.65 µs |      13.97 MB / 121.5 kB |

The cold population row measures the current APIs as used: Koota resolves definitions, reserves capacity, then uses bounded creation and three bounded attachments per entity. Iris uses its combined `createEntity(world, entries)` call with existing global schema definitions. This is not an isolated allocator comparison or evidence that paging itself costs 2.7×. A prepared bulk creation operation is another conforming experiment to run before changing storage.

For output collection, Iris's entity callback fills the prepared buffer. This measures materialization, not an assertion that every Iris query must visit entities individually. Its column visitor can borrow matching archetype arrays directly.

Koota's cold query construction scans the live population for every query. Iris chooses the smallest component-to-archetype index and tests those signatures. The 79× difference belongs to this selective, low-signature-diversity workload. It is not a general query speedup. The large Koota cold allocation is measured, but its allocation sites have not been profiled individually.

Labs reported 7.3% and 5.9% clock drift across the two runs. The Iris materialization case had substantial process and sample variance, and its cold query case also had noisy samples. Treat small differences cautiously. The active-query and cold-search gaps are much larger than the reported noise.

## Borrowed data and change publication

Both column cases write the same fractional values and read them back. Koota uses `getStore` plus `visitQuery`, addressing its existing pages by entity slot. Iris uses `EXPERIMENTAL_queryColumns` with dense Float64 columns. Neither engine changes storage for this experiment.

| Workflow, 10k values                    | Koota paged columns | Iris dense columns | Allocation, Koota / Iris |
| --------------------------------------- | ------------------: | -----------------: | -----------------------: |
| Borrowed writes without publication     |            19.78 µs |           12.60 µs |            5.4 B / 186 B |
| Borrowed writes, then publish every row |           413.52 µs |          214.77 µs |            152 B / 336 B |

The raw paged loop is about 33× faster than Koota's checked scalar write/read workflow in this fixture. That is a lower bound for a prepared data API, not a conforming replacement: raw writes bypass per-row validation, hooks, versions and notifications. Explicit publication recovers some speed, but still costs far more than moving the values. Publishing after all writes also gives observers different visibility from publishing after each individual write. Structural edits from observers were not exercised by this timing fixture.

The initial column harness mutated a captured floating-point accumulator on every row, adding roughly 80 kB of harness allocation per invocation. The reported column results use a local accumulator and publish its sum once per callback. The initial column measurements are excluded from the final comparison. Small remaining byte counts include measurement overhead and are not exact guarantees of zero allocation.

## Retained memory

Every row contains 10,000 subjects with three Float64-equivalent scalar fields. The query row adds the seven nonempty conjunctions of those three components. The shared-target row adds one relation to one common target. The distinct-target row adds 10,000 targets and a different pair on each subject.

| Population                           | Koota heap | Koota buffers | Koota total | Iris heap | Iris buffers | Iris total |
| ------------------------------------ | ---------: | ------------: | ----------: | --------: | -----------: | ---------: |
| Three scalars                        |    1.41 MB |       1.53 MB |     2.95 MB |   1.36 MB |      1.22 MB |    2.58 MB |
| Three scalars and seven queries      |    2.85 MB |       2.45 MB |     5.30 MB |   1.45 MB |      1.22 MB |    2.67 MB |
| Shared relation target               |    1.49 MB |       2.28 MB |     3.77 MB |   1.51 MB |      2.01 MB |    3.52 MB |
| Distinct relation target per subject |    5.51 MB |       3.30 MB |     8.81 MB |  86.63 MB |     20.42 MB |  107.05 MB |

Iris retains about 13% less in the uniform scalar population and about half as much with seven cached queries. Koota retains about 92% less in the distinct-target case. This supports keeping paged storage for relation-heavy workloads. Iris creates separate storage archetypes for distinct pair signatures, including column capacity and revision stamps. Koota adds pair identities and membership edges without copying the subject's other data.

These totals include the context, local schema registration, prepared capacity and a common 40 kB caller entity buffer. Imported module state and Iris's global schema registry are outside the measurement. Koota's prepared fixture differs from the earlier public-API retained-memory benchmark, so compare engines within this table rather than mixing the two reports.

## Architectural decisions and conformance

| Option                                                                          | Performance motivation                                       | Consequence                                                                                                                                                                                                                         |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Start cold queries from predicate users, with bounded candidate selection       | Avoid full population scans                                  | Compatible with the paged store and current contract. Use the existing reverse membership links and measure any count/index bookkeeping added to mutations.                                                                         |
| Cache signature-to-query matching decisions                                     | Avoid repeated predicate tests for recurring combinations    | Compatible as a search-only cache. Bound its capacity and retain a fallback for novel combinations and relation filters. It does not remove the cost of updating every matching cached result.                                      |
| Prepare data access once per borrowed visit                                     | Hoist definition, schema and page resolution                 | Can preserve identity checks and deferred structural edits. An additive API should define access lifetime and change publication explicitly. Replacing existing writes with unchecked or silent writes would break conformance.     |
| Make query results lazy, or replace per-query entity sets with signature groups | Reduce the 20-query mutation cost and query memory           | Contract-sensitive. Query membership notifications and revisions currently publish at mutation boundaries. Skipping those events changes semantics. A lazy fast path would need a conforming eager path for observers and tracking. |
| Adopt Iris's dense archetype storage                                            | Fast contiguous columns and cheap reuse of signature matches | Conflicts with the chosen paged component strategy and no-storage-archetypes constraint. Moves and copies retained components on structural edits. Distinct-target memory is a material counterexample.                             |
| Adopt Iris's world-local IDs and wrapped generations                            | Simpler direct metadata lookup and recycling                 | Breaks global ownership and permanent stale-handle rejection. Not justified by the access benchmark without isolating those validation costs.                                                                                       |
| Adopt Iris's bit-packed pairs                                                   | Compute a pair without interning an entity record            | Breaks generation-stable targets and nested pair targets, limits relation definitions to 256 globally, and exceeds the requested portable 30-bit Smi range for relation and some pair IDs. No isolated speedup is claimed.          |

The identity differences are executable observations in [check-semantics.ts](../../../benches/kernel-iris/check-semantics.ts): ordinary Iris IDs alias across worlds, the original handle becomes live again after 256 recycle operations, old pairs resolve to replacement targets, and pairs cannot be targets. Koota rejects foreign and exhausted handles, invalidates dependent pair identities, and supports nested pair targets.

The measured Node build has pointer compression disabled and accepts Iris's larger signed IDs as Smis. Their encoding therefore does not establish a heap-allocation penalty on this machine. It still fails the requested portable `[-2^30, 2^30)` constraint.

Iris also creates an entity metadata object and `records` array per ordinary entity, adds a `destroying` property later, grows archetype columns during insertion, and allocates a column list during each column query. It should be a performance reference, not a literal template for the monomorphic and bounded-allocation rules.

HiSparseBitSet remains an option for broad sparse filtering. The [existing measurements](entity-kernel-benchmarks.md) show that it does not universally beat small candidate probes or copying cached matches. First compare reverse-membership candidates, prepared bitset intersections and a bounded signature decision cache on the new selective-search fixture. None requires archetype storage.

## Source map

Paths below are relative to the Iris checkout at the recorded commit:

- `packages/ecs/src/entity.ts:120`: allocation, metadata creation and lazy definition registration. `:283` contains generation wrap on destruction.
- `packages/ecs/src/encoding.ts`: bit fields, type tags and packed pairs. `relation.ts:42` rejects pair targets, and `:82` resolves the target's current generation.
- `packages/ecs/src/archetype.ts:352`: capacity growth. `:665` copies columns and tick stamps during transitions.
- `packages/ecs/src/filters.ts:117`: smallest component-to-archetype candidate search.
- `packages/ecs/src/query.ts:336`: cached query lookup. `:621` documents unsupported structural mutation during iteration, and `:751` implements borrowed column iteration.
- `packages/ecs/src/component.ts:638`: scalar read, write and explicit change publication paths.

Koota's corresponding paths are [membership](../src/kernel/entity/membership.ts), [identity validation](../src/kernel/entity/entity-index.ts), [query construction](../src/kernel/query/query.ts), [buffered values](../src/kernel/entity/values.ts), and [change publication](../src/kernel/commands/handlers/changed.ts).

## Reproduce

From the Koota root, with Iris checked out beside it:

```sh
IRIS_SOURCE="$PWD/../iris/packages/ecs/src/index.ts" pnpm bench '@kernel-iris' -n kernel-iris
IRIS_SOURCE="$PWD/../iris/packages/ecs/src/index.ts" node --import tsx benches/kernel-iris/measure-retained-blocks.ts
IRIS_SOURCE="$PWD/../iris/packages/ecs/src/index.ts" node --import tsx benches/kernel-iris/check-semantics.ts
pnpm --filter @koota/benches exec tsc --noEmit -p kernel-iris/tsconfig.json
```

The optional comparison suites register only when `IRIS_SOURCE` is set. They do not add an Iris dependency or modify its checkout. Narrow follow-up runs with `@kernel-iris-columns` and `@kernel-iris-search`.
