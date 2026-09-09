# Prepared execution results

Prepared access, indexed discovery, lazy query plans, borrowed columns, and bulk spawning close much of the Iris gap. They keep global paged storage, generation validation, definition entities, and interned pair entities. No archetype storage or signature graph was added.

## Timing

These are medians of eight fresh-process Labs block medians. Each row processes 10,000 subjects unless stated otherwise. The environment is Node 26.1.0 on Apple M4 Pro, with Iris commit `001e47c93705d35612a70cd827761c4e5cac31f4` from the local checkout.

| Workflow                                              | Existing numeric operations | Prepared execution | Iris reference |
| ----------------------------------------------------- | --------------------------: | -----------------: | -------------: |
| Presence checks                                       |                    111.9 µs |            60.4 µs |        61.4 µs |
| Scalar write and read with publication                |                    637.2 µs |           419.3 µs |       304.3 µs |
| Tag toggle, no queries                                |                     1.94 ms |            1.32 ms |        2.09 ms |
| Tag toggle with 20 query definitions, no result reads |             20.17 ms, eager |      1.41 ms, lazy |        4.34 ms |
| Shared concrete pair toggle                           |                     4.40 ms |            4.18 ms |        5.32 ms |
| Borrowed scalar writes without notifications          |                     19.4 µs |  12.8 µs, `silent` |        12.6 µs |
| Borrowed scalar writes with publication, no observers |                    404.5 µs | 72.5 µs, `changed` |       197.3 µs |
| Cold setup and population, three scalar traits        |                     2.97 ms |       2.52–2.73 ms |        1.49 ms |

Publication and caching semantics matter. Prepared `changed` batches finish raw writes before publishing rows. Iris uses explicit revision marking. Prepared `silent` advances the trait version but omits hooks, notifications, and tracking. Existing eager-query notifications retain their behavior and cost.

The end-to-end mutation case reads all 20 results after toggling the tag on every entity. Prepared operations with eager caches take **20.06 ms**. The same mutation and materialization through lazy plans takes **3.07 ms**, about **6.5× faster**. This includes searching again after mutation. Each case verifies 200,000 returned matches.

Warm bulk spawning with three scalar traits takes **1.71 ms**, reporting **376 bytes** of Labs heap delta for the full batch. It reuses a context, compiled schemas, and reserved storage. Destruction and capacity replenishment occur between samples. Iris creation into a new empty world takes **1.55 ms** and reports **2,555,424 bytes**, including storage growth. Use the cold row to compare total setup work, including Koota's reservation.

## Query discovery

The cold fixture compiles 20 distinct queries over 10,000 subjects with 100 matches:

| Path                                            |        Compile and count |
| ----------------------------------------------- | -----------------------: |
| Frozen kernel before this work, eager queries   |                  6.23 ms |
| Current eager queries using the predicate index |                 173.7 µs |
| Prepared plans using the predicate index        |                  26.7 µs |
| Iris                                            | 55.0–87.5 µs across runs |

Required predicate counts select a small candidate list. Eager queries sort candidate dense rows to preserve their previous initial order. Plans need no materialized membership sets, per-query closures, or mutation subscriptions. They validate predicate lifetime once per execution and compile required, forbidden, and alternative masks.

Labs finds the eager search reduction significant at `p < .001`. The unchanged Iris control varied substantially between sittings. The roughly 36× observed reduction is descriptive, not an exact isolated architectural coefficient. Its magnitude and direction are clear. These results do not justify another search graph or integrating HiSparseBitSet into production queries.

## Publication optimization pass

The first prepared `changed` batch took **224.9 µs**. Every context maintains historical change masks, even before a tracking query is compiled. Omitting that work would change late-created tracking queries.

The final path marks history masks in batches, hoists generation and bitflag lookup, and reuses each mask page while visiting its rows. It dispatches per entity only when hooks, tracking queries, or observers require it. Time fell to **72.5 µs**, a **67.8%** reduction, with `p < .001`. Tests cover historical results, late subscriptions, hooks, pair rows, failures, and deferred structural edits.

With an observer receiving every change, the final batch takes **268.9 µs**. Per-entity callback work remains. Labs flagged silent and observed comparisons between passes as clock-confounded, so their small differences are inconclusive.

## Retained memory

The memory runner measures full-GC `heapUsed` plus `arrayBuffers`, with eight fresh processes per case and alternating case order. Each population has 10,000 subjects and three scalar traits. Query cases use their seven nonempty conjunctions. Workspaces retain seven entity buffers and seven row buffers, each sized for 10,000 results.

| Population                                     | Retained memory |
| ---------------------------------------------- | --------------: |
| Koota before, no queries                       |         2.95 MB |
| Koota current, no queries                      |         2.96 MB |
| Koota before, seven eager queries              |         5.28 MB |
| Koota current, seven eager queries             |         5.31 MB |
| Koota current, seven plans                     |         2.98 MB |
| Koota current, seven plans and full workspaces |         3.57 MB |
| Iris, no queries                               |         2.60 MB |
| Iris, seven queries                            |         2.69 MB |

Totals use decimal MB and include definitions, prepared capacity, and a common entity buffer. Imported modules and Iris's global definitions are outside the window. Predicate counts add 40,960 backing-store bytes for ten leased pages. Small heap differences between equivalent populations include runtime noise. [All 64 samples and exact medians](../../../benches/kernel-iris/prepared-memory-results.json) are retained.

Seven plans use about **44% less total retained memory** than seven eager caches. Keeping seven complete workspaces still uses about **33% less**. One workspace can instead serve multiple plans. Iris retains less in this shared-schema fixture. The separate [Iris comparison](iris-comparison.md) covers distinct-target relationships, where the storage tradeoff differs.

## Reproduction and limits

```sh
IRIS_SOURCE=/path/to/iris/packages/ecs/src/index.ts pnpm bench '@kernel-iris @kernel-prepared' -n prepared-current
pnpm bench '@kernel-prepared-columns' -n prepared-columns
IRIS_SOURCE=/path/to/iris/packages/ecs/src/index.ts pnpm bench '@kernel-prepared-population' -n prepared-population
KOOTA_KERNEL_SOURCE=/path/to/frozen/core/src/kernel/index.ts IRIS_SOURCE=/path/to/iris/packages/ecs/src/index.ts pnpm bench '@kernel-iris-search' -n prepared-search-before
IRIS_SOURCE=/path/to/iris/packages/ecs/src/index.ts KOOTA_BEFORE_SOURCE=/path/to/frozen/core/src/kernel/index.ts node --import tsx benches/kernel-iris/measure-prepared-memory.ts
```

[prepared-results.json](../../../benches/kernel-iris/prepared-results.json) preserves source fingerprints, 35 selected cases, block medians, heap deltas, snapshots, and Labs comparisons. Saved runs are `kernel-prepared-search-before`, `kernel-prepared-pass-1`, `kernel-prepared-pass-2`, and `kernel-prepared-population-warm`. The initial warm-spawn experiment recreated schemas before each sample. Its warm result is excluded and replaced by the persistent-context case.

The full first pass had 8.2% clock drift. Column callbacks use warmed workspace rows. The mutation-plus-materialization test includes refresh cost. Net heap deltas may be clamped to zero when collection occurs, so the cached cold-search zero-byte median is not evidence of allocation-free compilation. Values near the measurement floor do not prove literal zero allocation. Retained memory is measured separately.

Source timings do not predict bundled or browser performance exactly. Cold population and eager per-query mutation remain slower than Iris. Removing historical tracking or changing immediate notification timing would require another explicit contract decision. This pass preserves those behaviors and makes faster policies opt-in through the [prepared contract](prepared-execution.md).

Validation passed workspace types, isolated kernel and benchmark types, 274 core tests, 46 React tests, 43 Svelte tests, and 296 tests against the built package. Existing expected-failure cases remain expected failures. Formatting and linting were scoped to changed files.
