# Predicate metadata results

The adopted descriptor layout is documented in [unified descriptor directories](descriptor-directory-results.md). The results below describe the earlier experiment.

The subsequent [eager-query optimization](eager-query-results.md) addresses the 20-query mutation gap on the current kernel.

Numeric predicate access now uses compact execution records addressed through the global paged entity store. Trait definitions, relations, and pairs remain entities. Entity handles retain 22 slot bits and eight generation bits, including permanent retirement on generation exhaustion. Full-generation pair targets, nested pairs, ordinary-entity promotion, and implicit-definition visibility retain their behavior.

The baseline is commit `7ee5819`. Final measurements show faster numeric presence and value operations, with less retained heap for distinct pairs. Prepared execution, mutation, and borrowed-column controls show no significant regression. These results do not establish a speedup for every workflow.

The implementation removes the context's definition, pair-record, and prepared-access maps. Each predicate has one execution record, and `prepareEntityAccess` returns it after validation. A pair record also serves as its relation descriptor. Column references belong to the trait instance and are shared by its pairs. Relation-local pair interning and reverse target indexes remain maps.

Classification occupies unused bits in the existing allocator lifetime word. Numeric pair presence uses the word already loaded for identity validation, then probes membership directly. Ordinary traits use their masks. The existing paged destruction header stores a dense predicate row above its queue bit. Compaction updates the moved record's header, while its object, entity handle, and component rows stay stable. No pointer page is allocated for sparse definitions.

## Timing

Each invocation handles 10,000 subjects unless stated otherwise. Times are medians of eight fresh-process block medians from Labs 0.9.0 on Node 24.14.0, Apple M4 Pro. Before and after cases run serially in one interleaved schedule. Fixtures, buffers, schemas, and capacity preparation are outside warm measurements. Cold creation includes a fresh context, registration of an existing relation blueprint, and 1,000 targets and pairs. Destruction is outside that timed region.

| Workflow                              |    Before |     Final | Difference |
| ------------------------------------- | --------: | --------: | ---------: |
| Numeric scalar presence               | 129.19 µs | 101.21 µs |     −21.7% |
| Numeric scalar write/read             | 663.40 µs | 557.27 µs |     −16.0% |
| Mixed trait/pair write/read           | 992.33 µs | 759.63 µs |     −23.5% |
| Prepared scalar write/read            | 418.19 µs | 418.79 µs |      +0.1% |
| Mixed trait/pair presence             | 136.63 µs | 131.79 µs |      −3.5% |
| Distinct-pair presence                | 141.19 µs | 140.38 µs |      −0.6% |
| Resolve existing prepared access      |  72.02 µs |  69.00 µs |      −4.2% |
| Numeric tag toggle                    |   1.70 ms |   1.72 ms |      +1.2% |
| Prepared pair toggle                  |   4.44 ms |   4.33 ms |      −2.5% |
| Prepared tag toggle, 20 eager queries |  21.70 ms |  21.25 ms |      −2.1% |
| Borrowed columns, silent              |  14.07 µs |  14.05 µs |      −0.2% |
| Borrowed columns, changed             | 132.90 µs | 131.15 µs |      −1.3% |
| Cold context and 1,000 pairs          | 638.40 µs | 618.10 µs |      −3.2% |

Labs classifies the first three improvements as significant at `p < .001`. The other cases are neutral at its 5% practical-change threshold. The final run reported 9.0% clock drift. Changed-column publication had limited resolution near 8%, and cold creation near 10%, with substantial within-process noise. Their small median differences do not establish improvements. Warm allocation stayed at the same small harness baseline. Manual cold timing does not provide an allocation figure.

An intermediate compact layout made cold pair creation about 18% slower and repeated access resolution about 24% slower. A separate cold run on Node 26.1.0 confirmed that regression within that run. The final version shares column references directly and resolves prepared access from an already validated slot header. Neither regression appears in the final comparison, but cold creation remains noisy. The [Labs comparison](../src/kernel/benches/archive/metadata/metadata-final-comparison.txt) contains confidence intervals and diagnostics.

## Retained memory

These are separate full-GC measurements on Node 26.1.0 in eight fresh processes per case and variant, with alternating order. Totals include `heapUsed` and `arrayBuffers`, context-local registration, and reserved storage. Backing-store bytes are identical between variants in every fixture. The observed differences are on the V8 heap. Totals use decimal MB.

| Fixture                                              |   Before |    Final | Difference |
| ---------------------------------------------------- | -------: | -------: | ---------: |
| 10k subjects, three scalar traits                    | 2.999 MB | 3.011 MB |      +0.4% |
| Three scalars and one shared pair                    | 3.834 MB | 3.843 MB |      +0.2% |
| Three scalars and a distinct target/pair per subject | 8.962 MB | 8.441 MB |      −5.8% |
| 80 sparse definitions among 81,920 entity slots      | 6.034 MB | 6.052 MB |      +0.3% |

The distinct-pair fixture retains 520,588 fewer bytes at the median. The small increases elsewhere are 9–17 kB and should not be treated as precise per-entity costs.

## Architectural experiments

The initial direct pointer pages accelerated numeric value operations but added a metadata lookup to pair presence. Distinct-pair presence regressed about 37%, and sparse-definition retained memory grew about 15%. Both effects were addressed before selecting the final layout.

A handle-encoding experiment added one immutable pair bit within the positive Smi range. It kept eight generation bits but reduced the global slot limit to 2,097,152. It validated the encoded classification against the allocator and retained full target handles. It did not outperform classification in the allocator word. In the same comparison, distinct-pair presence took 153.12 µs with the handle bit and 140.19 µs with allocator classification. Scalar presence took 110.60 µs and 95.67 µs respectively. The capacity reduction was not adopted.

The final layout packs classification into metadata that lifetime checks already read, and packs the execution-record row into an existing slot header. It preserves the 4,194,304-slot identity space. All row indices, queue flags, classifications, and counts stay within the requested Smi range. Numeric values retain their existing storage and precision.

This applies the useful part of Iris's design without adopting its weak pair targets or small relation namespace. The earlier [Iris comparison](iris-comparison.md) remains the source for those engine differences. The metadata experiments compare Koota variants. A subsequent [fresh Iris comparison](metadata-iris-results.md) measures the selected layout against the same checkout.

## Validation and reproduction

Six new kernel tests cover mixed schemas, pair and definition slot reuse, invalid handles, page ownership changes, callback writes, and interrupted destruction. The retirement test now uses `getEntityGeneration` rather than a literal shift so it can validate the encoding experiment too. Both flag experiments passed the core contract suite. The selected implementation also passes the core, collections, React, Svelte, and packaged integration suites, isolated kernel and workspace typechecks, and the production build.

[metadata-results.json](../src/kernel/benches/archive/metadata/metadata-results.json) records every experimental run, block medians, calibration and allocation statistics, retained-memory samples, and source fingerprints. Pooled timing samples are omitted from this artifact. The ignored Labs result files retain them locally.

[Source variants](../src/kernel/benches/archive/metadata/variants/sources.json) identify the parent of each experiment and provide replay-verified patches starting from `7ee5819`. Apply each patch to its named parent with `git apply --unidiff-zero`. `shared-columns` is the selected implementation. The patches preserve exploratory states independently of subsequent source edits.

With a frozen baseline source tree, run from the repository root:

```sh
KOOTA_BEFORE_SOURCE=/path/to/before/packages/core/src/kernel/index.ts \
  pnpm --filter @koota/core bench '@kernel-metadata @kernel-metadata-control' -n metadata-check
```

Set `KOOTA_METADATA_SOURCE` to compare a frozen candidate. `KOOTA_STAMP_SOURCE` adds a third variant. `KOOTA_METADATA_CASE='cold context'` narrows the run to cold creation. Saved runs use eight blocks by default. The shared Labs baseline remains `boundary-before`.

For one retained-memory sample, run from the repository root and repeat in fresh processes with alternating variant order:

```sh
node --expose-gc --import tsx packages/core/src/kernel/benches/support/measure-metadata-memory.ts \
  /path/to/kernel/index.ts distinct
```

The fixture names are `plain`, `shared`, `distinct`, and `sparse`.
