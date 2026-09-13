# Eager query maintenance results

The subsequent [scalar access pass](scalar-access-results.md) updates value-access timings and reduces duplicated tracking history.

The 20-query tag-toggle workload fell from 22.68 ms to 8.23 ms, while Iris took 4.96 ms in the same run. This removes about 64% of Koota's time. Koota still takes about 1.66 times Iris's time. The result preserves eager query membership, versions, and notification semantics.

The baseline is the selected `shared-columns` source from the [predicate metadata work](predicate-metadata-results.md), also measured in the preceding [Iris comparison](metadata-iris-results.md). The earlier report overstated how close Koota was overall. Lazy plans do not resolve the eager-cache workflow's cost.

## Selected implementation

Numeric queries validate their predicate identities during construction, after registration callbacks finish. Destroying a referenced definition or pair invalidates the query through its existing dependencies. Repeated membership checks no longer validate every predicate handle for every subject. Public blueprint queries continue to follow re-registration, while numeric queries keep their original lifetimes.

Each trait's non-tracking dependencies use a packed reference array and an explicit count. The mutation loop calls shared membership functions and skips empty subscriber loops. Static queries with one mask generation keep a compiled mask reference and reuse the entity mask already loaded by the mutation. Visibility is checked once for the affected entity. Wider queries and relation filters use the general matcher. Tracking groups retain their separate event-driven matcher.

Query results still keep dense full entity handles and preserve their existing update order. The row index starts as a hash table. Reservation can replace it with paged integer rows when the estimated page and directory storage is smaller. New entity pages prepare existing query indexes, and expanding page coverage can return an index to hashing. This keeps small sparse queries compact while avoiding hash probes for dense results. Full-handle comparisons reject stale generations. Paged tracking sets can clear their live count without clearing every index entry.

The paged index is query membership storage, independent of component columns and the global allocator. No archetype storage or signature graph was introduced. No kernel contract change was needed.

## Timing

Labs 0.9.0 ran on Node 24.14.0 and an Apple M4 Pro. Each suite uses eight fresh-process blocks, with serial interleaving within the suite. All values below are medians of block medians for 10,000 subjects. Query compilation, population, and reservation occur outside warm measurements. Both Koota variants execute the same fixtures and assertions.

| Tag-toggle workload                        |     Before |   Selected | Reduction |
| ------------------------------------------ | ---------: | ---------: | --------: |
| No queries                                 |  1.4095 ms |  1.3911 ms |      1.3% |
| 20 numeric queries                         | 22.6770 ms |  8.2285 ms |     63.7% |
| 20 descriptor queries                      | 15.3173 ms |  8.3012 ms |     45.8% |
| 20 descriptor queries with observers       | 18.9410 ms | 14.2092 ms |     25.0% |
| 20 selective numeric queries               | 19.9325 ms |  7.2368 ms |     63.7% |
| 20 numeric queries across mask generations | 24.2344 ms | 14.6279 ms |     39.6% |
| Iris, 20 queries                           |          — |  4.9649 ms |         — |

The observed case delivers 400,000 query callbacks per batch. The selective case varies five tags across subjects and verifies every query's original result count after mutation. The wider case adds a required predicate in a later mask generation. Iris's row matches the ordinary 20-query fixture, not the observed, selective, or wider cases.

A compiled shortcut for removing required predicates or adding forbidden predicates was rejected. In one matched run it reduced the wider case from 14.50 ms to 12.45 ms, but increased the selective case from 7.45 ms to 8.32 ms. Its ordinary-case improvement was only about 2.5%. The selected implementation omits the additional rule array.

The preliminary CPU profiles identified predicate validation, repeated query matching, and result-index maintenance as targets. Their diagnostic timings are excluded from the comparison. The selected source retains a separate membership set for each eager query, so it still performs updates for each affected query. The remaining Iris gap has not been eliminated.

Labs classifies all five query-bearing improvements as faster at `p < .001`, with the no-query control neutral. The selected run reported a stable clock, 1.8% median spread, and overall comparison resolution near 2.5%. Individual observed and selective cases had lower resolution. The [comparison report](../src/kernel/benches/archive/eager-query/eager-selected-comparison.txt) includes confidence intervals and tails.

## Controls and memory

A separate eight-block run covered tracking consumption, tracking population, destruction, relation snapshots, prepared pair mutations, borrowed columns, and cold pair creation. It again reduced the 20-query mutation case from 20.66 ms to 8.39 ms. The other warm controls were neutral at Labs' 5% practical-change threshold. No control showed a significant median regression.

Cold cases remain less certain. First tracking population improved at the median from 938 µs to 785 µs, but its pooled p99 increased about 64%. Cold context and 1,000-pair creation also had noisy samples despite a lower median. Borrowed changed-column publication had limited resolution near 22%. These observations do not establish improved cold or tail latency. See the full [control comparison](../src/kernel/benches/archive/eager-query/eager-controls-comparison.txt).

Warm query-bearing mutations report the same 12,400-byte Labs median heap delta per batch before and after. The no-query control reports 136 bytes. These figures include measurement overhead and are not literal zero-allocation claims. Retained storage was measured separately after timing completed, with eight fresh Node 24.14.0 processes per variant and fixture and alternating order. Totals include full-GC `heapUsed` plus `arrayBuffers` and use decimal MB.

| Population, 10k subjects with three scalars |   Before | Selected | Difference |
| ------------------------------------------- | -------: | -------: | ---------: |
| No queries                                  | 3.004 MB | 2.983 MB |      −0.7% |
| Seven eager queries                         | 5.355 MB | 4.957 MB |      −7.4% |
| Seven lazy plans                            | 3.027 MB | 3.121 MB |      +3.1% |
| One shared relation target                  | 3.812 MB | 3.815 MB |      +0.1% |
| Distinct relation target per subject        | 8.364 MB | 8.382 MB |      +0.2% |

The eager-query fixture saves 398,048 bytes overall. Its V8 heap grows by 232,736 bytes while backing stores shrink by 630,784 bytes. The paged directory trades some heap references for a smaller integer index. The 93,544-byte increase in the lazy-plan fixture is recorded without a per-entity attribution. This pass does not claim a footprint improvement in every workflow.

## Validation and reproduction

Ten new regression cases cover predicate and pair lifetimes, interrupted destruction, registration callbacks, eager notification visibility, multiple mask generations, index growth and slot reuse, repeated tracking consumption, large relation target queries, and pages created during unpublished query construction. Core tests pass with 311 passing cases and one existing expected failure. React tests pass with 46 cases and one existing expected failure, Svelte with 43 cases, and built-package tests with 307 cases and two existing expected failures. The production build and workspace, isolated kernel, and benchmark typechecks pass. Formatting and linting are scoped to the changed files.

The selected source patch replays exactly onto the baseline, verified by source hashes. [eager-query-results.json](../src/kernel/benches/archive/eager-query/eager-query-results.json) preserves all saved experiment cases, block medians, spread and calibration readings, allocation statistics, all 80 retained-memory samples, and source fingerprints. The `eager-final` run records the rejected rule-array experiment. `eager-selected` records the retained source. CPU-profile timings are excluded. Pooled timing samples remain in the ignored Labs results.

With Node 24.14.0 active, run from the repository root:

```sh
IRIS_SOURCE=/path/to/iris/packages/ecs/src/index.ts \
  KOOTA_BEFORE_SOURCE=/path/to/before/packages/core/src/kernel/index.ts \
  pnpm --filter @koota/core bench '@kernel-eager-query' -n eager-check

KOOTA_BEFORE_SOURCE=/path/to/before/packages/core/src/kernel/index.ts \
  pnpm --filter @koota/core bench '@kernel-query-lifecycle @kernel-metadata-control' -n eager-controls-check
```

`KOOTA_EAGER_SOURCE` selects a frozen candidate for the eager suite. `KOOTA_EAGER_CONTROL` adds a third variant. `KOOTA_EAGER_CASE` selects `none`, `numeric`, `descriptor`, `observed`, `selective`, or `wide`. `KOOTA_METADATA_SOURCE` selects a frozen candidate for the metadata controls. The shared Labs baseline remains `boundary-before`.

The [selected patch](../src/kernel/benches/archive/eager-query/eager-query.patch) applies with `git apply --unidiff-zero` to the `shared-columns` variant recorded in [metadata sources](../src/kernel/benches/archive/metadata/variants/sources.json). To reproduce retained samples, use the existing `measure-retained.ts` runner with `KOOTA_KERNEL_SOURCE` pointing to each variant, as described in the [Iris comparison](metadata-iris-results.md).
