# Current metadata layout against Iris

The subsequent [scalar access pass](scalar-access-results.md) updates value-access timings and reduces duplicated tracking history.

The subsequent [eager-query optimization](eager-query-results.md) addresses the 20-query mutation gap on the current kernel.

The selected predicate metadata layout was measured against Iris on September 9, 2026. Prepared presence is close to Iris, while checked scalar access, eager query maintenance, and cold creation remain slower. Prepared plans, tag and pair mutations, and cached-result copying perform well. Distinct-target relations retain much less memory with Koota's paged storage.

These are fresh measurements of the current source, rather than ratios between historical runs. The source matches the `shared-columns` variant in [the metadata experiments](predicate-metadata-results.md). Iris is the clean local checkout at commit `001e47c93705d35612a70cd827761c4e5cac31f4`, version 0.0.14. Both engines use Labs 0.9.0, Node 24.14.0, and an Apple M4 Pro. The previous metadata report incorrectly labeled most timing runs as Node 26.1.0. Its runtime labels have been corrected from the saved worker metadata.

## Timing

Times are medians of eight fresh-process block medians. Cases run serially and interleave within each suite. Ordinary workloads process 10,000 subjects per invocation. Numeric scalar fields have double precision in both engines. Preparation, capacity reservation, query compilation, and fixture creation occur outside warm measurements.

| Workflow                                              | Koota numeric or eager | Koota prepared or lazy |      Iris |
| ----------------------------------------------------- | ---------------------: | ---------------------: | --------: |
| Scalar presence                                       |              102.38 µs |               67.73 µs |  71.58 µs |
| Scalar write/read with publication                    |              574.56 µs |              420.44 µs | 284.48 µs |
| Tag toggle, no queries                                |                1.78 ms |                1.56 ms |   2.33 ms |
| Tag toggle, 20 queries, no result reads               |               23.15 ms |          1.71 ms, lazy |   4.99 ms |
| Shared pair toggle                                    |                4.60 ms |                4.36 ms |   5.82 ms |
| Borrowed scalar writes, silent                        |               19.87 µs |               14.14 µs |  12.63 µs |
| Borrowed scalar writes, publication without observers |              401.48 µs |              123.98 µs | 211.40 µs |
| Compile and count 20 queries, 100 matches among 10k   |              247.60 µs |        25.71 µs, plans |  82.94 µs |
| Cold setup and population, three scalars              |                3.24 ms |          3.21 ms, bulk |   1.54 ms |
| Materialize 10k cached query results                  |                3.62 µs |                      — |  11.94 µs |

Prepared scalar access takes about 1.48 times Iris's time. Eager tag toggles still take 22.85 ms with prepared mutation, about 4.58 times Iris's time. Preparing an access does not remove eager query maintenance. Cold bulk creation takes about 2.08 times Iris's time in this fixture.

The lazy mutation benchmark defers result computation. Including all 20 result reads takes 3.34 ms, versus 22.70 ms through eager caches. Both cases validate 200,000 returned matches. No matched Iris mutation-plus-materialization case was run, so the 3.34 ms figure is not compared directly with Iris's mutation-only result.

Warm bulk spawning into reserved Koota storage takes 1.69 ms. Iris spawning into an empty world takes 1.59 ms. The latter includes storage growth, while Koota's reservation occurs outside the warm window. The cold row includes setup and reservation and is the appropriate comparison for total initial population cost.

Publication semantics differ. Koota's prepared `changed` column visit completes writes before publishing changes and still updates historical tracking. Iris explicitly marks revisions. Koota's `silent` visit omits hooks, notifications, and tracking while advancing the trait version. Eager subscriptions preserve mutation-boundary behavior. Lazy plans avoid maintaining per-query entity sets. Column publication with a per-entity Koota observer takes 247.79 µs, recorded separately without an Iris equivalent.

Labs reported 9.0% clock drift. Median spread across cases was 1.8%, but Iris presence and several column, creation, and query cases had substantial noise. Presence should be described as close, not as a proven small Koota advantage. Ratios are descriptive workflow comparisons, not isolated costs of a bit layout or statistical claims that every reported difference is significant.

## Allocation and retained memory

Warm scalar write/read reports 136 bytes per 10k batch for either Koota path and 160,136 bytes for Iris. Tag toggles without queries report 136 bytes for Koota and about 1.52 MB for Iris. Shared-pair toggles report roughly 12 kB for Koota and 2.97 MB for Iris. Koota eager-query toggles report about 13 kB and Iris about 1.53 MB. These are Labs median heap deltas, including backing stores, rather than guarantees of literal zero allocation. Forced GC pauses are outside the reported timing windows.

Retained memory was measured separately after timing completed, using eight fresh Node 24.14.0 processes per engine and fixture with alternating order. Totals include full-GC `heapUsed` plus `arrayBuffers`, context registration, reserved storage, and a common 40 kB caller entity buffer. Imported module state and Iris's global definitions are outside the measurement window. Values below use decimal MB.

| Population, 10k subjects with three scalars |    Koota |                    Iris |
| ------------------------------------------- | -------: | ----------------------: |
| No queries                                  | 3.004 MB |                2.596 MB |
| Seven eager queries                         | 5.355 MB |                2.669 MB |
| Seven lazy plans                            | 3.027 MB | 2.669 MB, seven queries |
| Seven plans with seven complete workspaces  | 3.585 MB | 2.669 MB, seven queries |
| One shared relation target                  | 3.812 MB |                3.507 MB |
| Distinct relation target per subject        | 8.364 MB |              107.092 MB |

Uniform scalar storage retains about 16% more in Koota. Seven plans retain about 13% more than Iris's seven queries, while eager caches retain about twice as much. The distinct-target fixture retains about 92% less in Koota. This remains a strong reason to keep paged storage for relations.

## Reproduce

Run the matched suites from the repository root with Node 24.14.0 active:

```sh
IRIS_SOURCE=/path/to/iris/packages/ecs/src/index.ts \
  pnpm --filter @koota/core bench '@kernel-iris @kernel-prepared' -n metadata-iris-current
```

For retained memory, run each engine and fixture in a fresh process and alternate their order across eight repetitions:

```sh
IRIS_SOURCE=/path/to/iris/packages/ecs/src/index.ts \
  node --expose-gc --import tsx packages/core/src/kernel/benches/support/measure-retained.ts koota scalars
```

Engines are `koota` and `iris`. Common fixtures are `scalars`, `queries`, `pairs`, and `unique-pairs`. Koota also supports `plans` and `workspaces`.

[metadata-iris-results.json](../src/kernel/benches/archive/iris/metadata-iris-results.json) preserves all 35 timing cases, block medians and spread, calibration readings, allocation statistics, all 80 retained-memory samples, and source fingerprints. Pooled timing samples remain in the ignored Labs result `metadata-iris-current`. Every benchmark assertion passed. The shared Labs baseline remains `boundary-before`. No production code changed for this comparison.
