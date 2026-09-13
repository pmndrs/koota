# Scalar access optimization

Prepared scalar write/read now takes 275.27 µs per 10,000 entities, alongside Iris at 280.08 µs. Numeric-handle access takes 454.44 µs, so it remains about 1.62 times Iris's time. This is a result for this workload, not parity across the engines.

The selected implementation keeps the existing API, runtime-compiled row accessors, paged storage, and full entity lifetimes. No contract change was needed. Direct field access was tested and rejected because it increased temporary heap usage without improving on the selected prepared buffer path.

## What changed

Tracking cursors that exist when a context initializes share one history because their starting snapshots and subsequent updates are identical. A cursor created later receives its own history. Each query still owns its consumption trackers, so consuming one query does not consume another's results. Three maps became one cursor-to-history map and a packed list of distinct histories with an explicit count. Mutation, reservation, generation growth, and destruction visit that list once.

Every value write still advances the trait version and records history, including history needed by queries first compiled after the write. The kernel now separates that bookkeeping from hooks, tracking-query updates, and observer dispatch.

A prepared write can skip the mutation lifecycle only when it has a real typed input buffer, no `onSet` hook, no tracking queries or change subscribers, and no pending publication work that requires the boundary. It retains entity, predicate, membership, capacity, and nesting checks. Subscriber presence is checked on each write. Plain buffers and typed-array proxies retain the general lifecycle because input getters can reenter the kernel. Borrowed writes preserve outer deferral boundaries.

## Matched measurements

Labs 0.9.0 ran on Node 24.14.0 and an Apple M4 Pro. The baseline is the selected source from the [eager-query pass](eager-query-results.md), frozen before this experiment. Results are medians of eight fresh-process block medians. Cases execute serially and interleave within each file. Creation, preparation, and reservation are outside warm measurements.

Each invocation writes and reads one double-precision field on 10,000 existing entities. Both Koota paths use a reused `Float64Array(1)`. Iris uses its scalar field setter and getter. Both publish changes through their normal behavior. The scalar fixture has no active hooks or tracking queries.

| Workflow                                    |    Before |  Selected |    Change |
| ------------------------------------------- | --------: | --------: | --------: |
| Numeric handles, buffer write/read          | 568.90 µs | 454.44 µs |    −20.1% |
| Prepared access, buffer write/read          | 420.71 µs | 275.27 µs |    −34.6% |
| Iris scalar field write/read                |         — | 280.08 µs | Reference |
| Prepared access, plain buffer               | 420.06 µs | 357.67 µs |    −14.9% |
| Prepared access with an `onSet` hook        | 560.40 µs | 511.21 µs |     −8.8% |
| Prepared access with a change observer      | 458.56 µs | 405.56 µs |    −11.6% |
| Prepared access and consume a Changed query | 829.31 µs | 779.27 µs |     −6.0% |
| Prepared access with eight later cursors    | 652.58 µs | 543.73 µs |    −16.7% |

All seven matched Koota cases are faster at Labs' 5% practical-change threshold and `p < .001`. The run reported a stable clock, 1.2% median spread, and approximately 1.6% comparison resolution. The prepared Koota and Iris medians are close enough to describe as comparable, not a demonstrated win over Iris. See the [comparison](../src/kernel/benches/archive/scalar-access/scalar-selected-comparison.txt).

Warm Koota operations report the same 136-byte Labs median heap delta per batch before and after, including the publication controls. Iris reports 160,136 bytes in the scalar case. These are harness-inclusive measurements, not guarantees of literal zero allocation. GC pauses are outside the timing windows.

## Integration controls and retained memory

A separate eight-block run compared 18 affected workflows. Labs classified nine as faster and nine as neutral, with no significant timing regression. Numeric and prepared scalar controls reproduced the main improvements. Mixed trait/pair writes fell from 781.06 to 690.96 µs. Numeric tag toggles fell from 1.752 to 1.560 ms, and prepared toggles with 20 eager queries fell from 8.214 to 7.782 ms. Changed-column publication without consumers fell from 123.23 to 33.33 µs. Destroying a tracked population fell from 4.332 to 3.306 ms.

Presence, prepared-address resolution, silent columns, first tracking population, and relation snapshots were neutral. Cold context creation and the 100-write tracking case had limited resolution and remain inconclusive. The first tracking-population median stayed at approximately 777 µs, with pooled p99 up 1.6%. See the [control comparison](../src/kernel/benches/archive/scalar-access/scalar-controls-comparison.txt) for confidence intervals and tails.

Retained memory uses eight fresh Node 24.14.0 processes per fixture and variant, alternating order. Each sample forces three collections before and after population and includes both V8 heap and ArrayBuffer backing stores. Values below are medians of the combined delta, in decimal MB.

| Population                                           |   Before | Selected |        Reduction |
| ---------------------------------------------------- | -------: | -------: | ---------------: |
| 10k subjects with three scalar traits                | 3.013 MB | 2.621 MB | 0.392 MB / 13.0% |
| Three scalars and one shared pair                    | 3.845 MB | 3.452 MB | 0.392 MB / 10.2% |
| Three scalars and a distinct target/pair per subject | 8.372 MB | 7.648 MB |  0.724 MB / 8.7% |

The reductions include fewer history directories on the heap and fewer duplicate mask pages in ArrayBuffers. Distinct pairs span more entity pages, increasing the savings.

The Labs cold first-population case reported a larger heap delta, 374,688 to 620,448 bytes, despite neutral timing. An isolated diagnostic in eight fresh processes per variant, with collection immediately before query compilation, measured approximately 1.204 versus 1.202 MB of temporary heap delta and 484,564 versus 487,676 retained bytes. That does not establish an increased retained query cost, but the cold Labs allocation difference remains unresolved. The diagnostic is reproducible with `measure-query-memory.ts`. Warm allocation and retained world storage are reported separately rather than treating either as a guarantee about every allocation path.

## Validation

Core tests: 317 passed and one expected failure. React: 46 passed and one expected failure. Svelte: 43 passed. Built-package tests: 307 passed and two expected failures. Production build, workspace package types, isolated kernel types, and the scoped Iris bench types passed.

Six added regression cases cover independent cursor consumption, cursors created between writes, Added/Removed baselines, mask-generation growth and slot reuse, typed writes across subscription changes, and reentrant input getters including typed-array proxies. Source patches replay to each frozen variant and match its fingerprint. Changed files were formatted and linted.

## Experiments and selection

The direct-field prototype read and wrote schema-ordinal columns while preserving lifetime, membership, and publication behavior. The first version took 420.23 µs for prepared access, essentially unchanged from the buffer baseline. It reported 320,144 bytes of temporary heap per batch. Removing a buffer is not by itself a performance improvement in this runtime.

Shortening publication reduced prepared field access to 332.19 µs. Sharing initial histories reduced it to 273.46 µs. Moving the callback path into a helper improved numeric field access, but its heap cost remained. Applying the short write path to the existing typed buffer reached 274.44 µs with a 136-byte heap delta in that experiment. The final selection removes the experimental field API entirely.

The experiments isolate useful implementation steps, but their changing intermediate layouts are not independent estimates of each instruction's cost. Only the final matched run supports the before/after claims above. No handle-packing or component-storage change was required.

## Reproduction

The [results artifact](../src/kernel/benches/archive/scalar-access/scalar-access-results.json) includes per-block timings, heap deltas, and retained-memory samples. The [source manifest](../src/kernel/benches/archive/scalar-access/variants/sources.json) fingerprints the frozen baseline and each experiment. Its patches apply sequentially to the named parent. The baseline is the earlier eager-query selection, not bare commit `7ee5819`.

Run the matched scalar and publication cases from the repository root:

```sh
IRIS_SOURCE=/path/to/iris/packages/ecs/src/index.ts \
KOOTA_BEFORE_SOURCE=/path/to/before/packages/core/src/kernel/index.ts \
KOOTA_SCALAR_SOURCE=/path/to/selected/packages/core/src/kernel/index.ts \
pnpm --filter @koota/core bench '@kernel-scalar-access @kernel-value-publication' -n scalar-check
```

The scalar bench also recognizes the field operations in archived experimental variants. The production kernel exposes only the existing buffer operations.

The affected integration controls use:

```sh
KOOTA_BEFORE_SOURCE=/path/to/before/packages/core/src/kernel/index.ts \
KOOTA_METADATA_SOURCE=/path/to/selected/packages/core/src/kernel/index.ts \
pnpm --filter @koota/core bench '@kernel-metadata @kernel-metadata-control @kernel-query-lifecycle' -n scalar-controls
```

Retained-memory fixtures use `measure-metadata-memory.ts` with `plain`, `shared`, or `distinct`. Run each variant in a fresh Node process with `--expose-gc`, alternate variant order, and include both `heapUsed` and `arrayBuffers`. The shared Labs baseline remains `boundary-before`.
