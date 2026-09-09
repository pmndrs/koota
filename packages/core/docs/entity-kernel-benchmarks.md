# Entity kernel measurements

The production kernel keeps the global paged store and gives traits, relations, and pairs real entity identities. It uses linked integer membership edges, paged schema columns, and cached query sets. There is no archetype storage or production signature graph.

The [Iris reference comparison](iris-comparison.md) measures matching workflows against `Dev/iris`, including retained heap, direct column access and the contract implications of its architecture.

## Method

Measurements ran on an Apple M4 Pro with Node 26.1.0. Labs records eight fresh-process blocks. The tables use the median of those block medians, rather than selecting the fastest sample. Heap figures are Labs p50 bytes per complete workload invocation. A 10,000-entity row reports the whole batch, not a single entity.

The baseline is the kernel contract implementation present before this rewrite, including the workspace's uncommitted contract work. Source hashes, block timings, clock estimates, and intermediate passes are preserved in [production-results.json](../../../benches/kernel-workflows/production-results.json). The final review extended the cold tag-promotion guard to lifecycle callbacks. That rejection path is outside the measured prepared-predicate workloads, and both source hashes are recorded. The historical flat entity prototype and tag-only archetype graph have narrower semantics and are not used as the production baseline.

Labs reports allocation during a workload, which is different from retained storage. Small values such as 152 bytes reflect harness and measurement overhead, not proof that every execution allocates exactly that amount. ArrayBuffer backing stores also need separate accounting. The retained-memory script measures `heapUsed + arrayBuffers` after full GC across eight fresh processes for each version.

The original scene-graph fixture derived values and tie-breaking order from handles. Definitions and pairs change handle allocation, so Labs correctly flagged three different snapshots. Those original timings are excluded from the comparison tables. The fixture now uses creation order and frame position instead. `kernel-scene-before` and `kernel-scene-after` rerun all three variants with the same inputs against the before and after source snapshots. All three snapshots match. Labs classifies two variants as faster and OrderedRelation as slower.

## Production results

| Workload                                   |    Before |     Final | Speedup | Heap per invocation |
| ------------------------------------------ | --------: | --------: | ------: | ------------------: |
| spawn with no traits                       | 917.38 µs | 316.10 µs |   2.90× |  3.28 MB → 542.3 kB |
| spawn with 1 trait                         |   2.32 ms |   1.42 ms |   1.63× |   6.32 MB → 2.21 MB |
| warm high fan-out remove and attach 10k    |  42.53 ms |   2.96 ms |  14.35× |    720.2 kB → 168 B |
| destroy target with 10k incoming relations |   5.24 ms |   1.67 ms |   3.14× |    1.76 MB → 1.2 kB |
| spawn when 20 queries active               |  29.80 ms |  11.27 ms |   2.65× |  8.52 MB → 720.3 kB |

The improvements are concentrated in creation, relation fan-out, target deletion, and spawning with active queries. The rewrite also changes costs rather than eliminating them. Definition and pair records are created once, cached-query removals now update immediately, and public reads still create immutable snapshots. Preserve compiled query handles when possible, instead of rebuilding nested descriptors inside a loop.

| Other workload                               |    Before |     Final | Time change |
| -------------------------------------------- | --------: | --------: | ----------: |
| entity.has (true)                            | 157.75 µs | 198.42 µs |      +25.8% |
| entity.has (false)                           | 128.15 µs | 167.48 µs |      +30.7% |
| entity.get                                   | 293.42 µs | 344.02 µs |      +17.2% |
| destroy entities with 3 traits               |   3.93 ms |   4.65 ms |      +18.5% |
| remove trait when 20 queries active          |   3.27 ms |   4.11 ms |      +25.7% |
| relation churn                               |  33.63 ms |  40.82 ms |      +21.4% |
| toggle parents with ChildOf(IsPlayer) active | 180.31 µs | 216.02 µs |      +19.8% |
| scene graph propagation: OrderedRelation     |   1.00 ms |   1.17 ms |      +16.7% |
| nested relation target filter                |  370.3 ns |  535.1 ns |      +44.5% |

Clock and sample spread are included in the result artifact. Labs reported 10.0% clock drift in the original baseline and 7.6% in the final full run. Several public query and relation workloads have substantial variance. Small percentage differences in those rows should not be treated as reliable improvements.

## Storage and identity tradeoffs

| Retained storage           |   Before |   Final |
| -------------------------- | -------: | ------: |
| V8 heap                    |  3.95 MB | 1.31 MB |
| ArrayBuffer backing stores | 174.1 kB | 1.44 MB |
| Combined                   |  4.12 MB | 2.75 MB |

Combined retained storage fell 33.3%. Samples are in [retained-results.json](../../../benches/kernel-workflows/retained-results.json).

This is 10,000 ordinary entities with three scalar traits and no queries. The measurement includes context creation and schema registration. The caller's output array is created before measurement. Numeric column pages are packed plain double arrays. Integer membership, liveness, and reverse-row pages use typed arrays for bounded layout and footprint.

The 30-bit handle uses 22 index bits and eight generation bits. Global capacity is now 4,194,304 slots, compared with the former 16,777,216. Smaller fixed page directories contribute to memory savings. Definitions and pairs share that capacity. Exhausted generation slots retire permanently, so stale handles never become valid again.

| Other occupied slots | Flat reverse index | Final paged allocator validation |
| -------------------: | -----------------: | -------------------------------: |
|                    0 |           33.62 µs |                         41.21 µs |
|                65536 |           35.35 µs |                         41.29 µs |
|              1048576 |          226.96 µs |                         41.31 µs |

The extra addressing benchmark validates 10,000 handles in a small context after other contexts occupy progressively more global slots. Paging the reverse lookup removes the large sparse-array cost. Liveness is checked against owner and packed generation/live metadata in the global allocator page.

## Prepared native workflows

| Native workload                    | Final time | Heap per invocation |
| ---------------------------------- | ---------: | ------------------: |
| buffered fractional values 10k     |  781.08 µs |               152 B |
| bounded tag detach and attach 10k  |    3.02 ms |               152 B |
| bounded pair detach and attach 10k |    4.61 ms |               200 B |
| caller-owned query output 10k      |    3.60 µs |                 2 B |
| deferred tag detach and attach 10k |    3.41 ms |               496 B |

These rows use preallocated identities, memberships, columns, buffers, and existing query caches. They do not claim that arbitrary user factories, observers, tracking histories, or deferred object snapshots are allocation-free. `tryCreateEntity`, `tryAttachEntity`, scalar value buffers, and bounded collection expose the low-allocation paths directly.

## Sparse filtering and search experiments

| Prepared filtering         | Previous bitset | Rewritten bitset | Bounded bitset output | Hash probes | Cached copy |
| -------------------------- | --------------: | ---------------: | --------------------: | ----------: | ----------: |
| dense 100k                 |        97.38 µs |        102.06 µs |              50.23 µs |   325.27 µs |    10.37 µs |
| sparse 10k across 1m slots |       112.12 µs |         47.12 µs |              47.83 µs |    27.02 µs |     1.03 µs |
| disjoint page ranges 10k   |          8.5 ns |           7.9 ns |                8.4 ns |    42.63 µs |      2.0 ns |
| sparse 10k across 4m slots |     Unsupported |         70.15 µs |              73.21 µs |    25.04 µs |     1.02 µs |

The dense case returns 30,000 indices, and the scattered cases return 3,000. Full results, including primitive insert/remove/drain regressions and intermediate passes, are in [sparse-results.json](../../../benches/kernel-workflows/sparse-results.json).

| Retained storage per bitset, capacity 2^20 |   Before |    Final |
| ------------------------------------------ | -------: | -------: |
| empty                                      |    716 B |  11.1 kB |
| dense 10k                                  |   4.0 kB |  14.5 kB |
| sparse 10k across 1m                       | 330.0 kB | 335.6 kB |

Fixed directories increase empty-set memory. Choosing the smallest sufficient capacity avoids paying for unused address space. Leaf summaries add four bytes per allocated leaf. These [retained samples](../../../benches/kernel-workflows/sparse-retained-results.json) include V8 heap and ArrayBuffer backing stores.

Prepared filtering reuses its input arrays, callback, and output. The older collection microbenchmarks also measure their caller-created arrays, callbacks, and checksum arithmetic, so their total heap figures are not the bitset implementation alone. Prepared filtering is compared separately from index construction and cache maintenance. A cached copy pays its query-maintenance cost when entities change. A bitset recomputes the intersection on each read. These are different workload choices, so the table is not a claim that one representation wins universally.

HiSparseBitSet indexes raw slots, not generation-bearing handles. Its default capacity remains 2^20, and an explicit capacity can cover the kernel's full 2^22 range. It has fixed directories, retained sparse leaf blocks, bounded insertion after preparation, and bounded output collection. Nested read-only filtering uses local loop state with no module scratch. Convenience insertion, range filling, cloning, and snapshot collection may allocate. Invalid indices do not alias valid slots. Mutating sets while visiting them is outside the iteration contract.

The production query cache remains in place. No extra per-predicate bitset or archetype membership cache is maintained without a workload that pays for its update and memory costs. The standalone archetype graph is retained as an experiment. Its transition benchmarks omit relation policies, component data, hooks, tracking, and membership edges, so they are not production speedups.

## Validation

Core tests pass with 258 passing tests and one existing expected failure. Collections has 30 passing tests. React has 46 passing tests and one existing expected failure, and Svelte has 43 passing tests. The built package has 296 passing tests and two existing expected failures. Workspace and isolated kernel typechecks, benchmark typechecks, and scoped formatting and lint checks pass.

Coverage includes real definition and pair identities, nested pair cleanup, stale handles, generation retirement, page ownership, reserved capacity near retirement, arbitrary schema keys, deferred numeric commands, nested query visits, bounded buffers, sparse bitset boundaries, and interrupted drains.

## Reproduce

Run the relevant suites separately from tests and other CPU-heavy work:

```sh
pnpm bench '@entity @relation @query @kernel-workflows @kernel-native @kernel-addressing' -n kernel-optimized-final
pnpm bench '@kernel-sparse' -n kernel-sparse-after
pnpm bench '@scene' -n kernel-scene-after
pnpm --filter @koota/collections exec labs '@bitset' -n kernel-bitset-optimized
pnpm bench baseline kernel-production-before
pnpm bench compare kernel-optimized-final
node --expose-gc --import tsx benches/kernel-workflows/measure-retained.ts
node --expose-gc --import tsx benches/kernel-workflows/measure-sparse-retained.ts
```

`KOOTA_KERNEL_SOURCE` selects a kernel source checkout for the compatibility workflows and retained-memory script. `KOOTA_API_SOURCE` selects a public API source checkout for scene-graph comparisons. `KOOTA_BITSET_SOURCE` selects a bitset source module for its retained-memory script. Timings are machine-specific observations, not API guarantees.
