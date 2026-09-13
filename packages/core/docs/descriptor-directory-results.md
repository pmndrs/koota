# Unified descriptor directories

The kernel now uses the measured large pointer-page layout (`paged-fixed`), prioritizing repeated numeric access speed over the additional memory. This replaces the descriptor index itself. Every valid component and pair follows the same lookup path. Observed writes use the resolved descriptor and the existing publication path. There is no bounded fast region and no fallback to a second lookup implementation.

The global entity allocator, 22-slot-bit / eight-generation-bit handles, component storage, full pair targets, and public behavior remain unchanged. Ordinary values still use subject slots and pair values use membership rows. No archetype storage was introduced.

Large pointer pages are the strongest speed option: final scalar access is 7.0% faster, distinct-pair access 8.3% faster, and sparse access 12.7% faster. They add 42,256 bytes in the dense fixture and 563,120 bytes in the sparse-definition fixture. Repeated dense prepared-access resolution is 6.3% slower.

Small pages cut the sparse directory cost substantially, but retain only the sparse-access improvement. Bitmap compression reduces empty pointer storage but adds enough addressing work to regress most point-access cases. The compact baseline remains the leanest measured layout. Large pages are selected for their faster scalar, sparse, and pair access, with the measured memory increase accepted.

## Layouts

| Layout              | Addressing                                                   | Memory and mutation tradeoff                                                                                 |
| ------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| Baseline            | Existing paged header → dense record index → descriptor      | Reuses a word in storage already required for membership and destruction. Descriptor references are compact. |
| Large pointer pages | Page → one of 1,024 descriptor references                    | One fewer indirection, but a single definition allocates a whole pointer page.                               |
| Small pointer pages | Page → 32-entry block → descriptor                           | Adds an indirection while allocating much less empty pointer capacity.                                       |
| Bitmap pages        | Page → occupancy bit and rank → compact descriptor reference | Stores only occupied references, with bit counting on reads and bounded shifting on insertion and deletion.  |

Bitmap pages use 32 occupancy words, 32 prefix offsets, and a reference array with explicit count and capacity. They apply the sparse indexing idea behind HiSparseBitSet without its search hierarchy. The existing collection stores membership bits, not values or generations, so it was not changed. All descriptor lookups still validate the complete entity handle where required.

Creation prepares storage. Lookups and removal allocate no directory storage. Empty pages remain available until context reset. Prepared descriptor objects stay stable when bitmap entries move.

The initial pointer variants used `Array.from` to prepare null entries. Indexed initialization reduced construction time but retained extra backing capacity. The final pointer variants use an array of the required size followed by `fill(null)`. V8 inspection confirmed packed elements for both `Array.from` and the filled arrays on the tested Node 24.14.0 runtime. These are runtime observations, not assumptions about every JavaScript engine.

## Measurements

Labs 0.9.0 on Node 24.14.0, Apple M4 Pro. Each timing is the median of eight fresh-process block medians. Read/write workloads perform 10,000 iterations. The new routing cases measure writes without reads, and repeated prepared-access resolution separately. Existing controls cover hooks, observers, tracking, query mutation, and definition/pair creation.

The first full run compared the compact baseline, large pages, and bitmap pages. A second run compared optimized large and small pages, but encountered substantial scheduling noise. The final run repeats the key access and publication cases with the final allocation strategy. Results from different timing runs are not combined into a speedup.

| Workflow                      | Baseline, µs | Large pages, µs | Change | Small pages, µs | Change |
| ----------------------------- | -----------: | --------------: | -----: | --------------: | -----: |
| Quiet writes only             |       310.54 |          299.62 |  -3.5% |          313.90 |  +1.1% |
| Observed writes only          |       372.98 |          357.27 |  -4.2% |          368.08 |  -1.3% |
| Resolve 64 dense definitions  |        70.90 |           75.33 |  +6.3% |           77.35 |  +9.1% |
| Resolve 64 sparse definitions |        77.98 |           79.69 |  +2.2% |           81.29 |  +4.2% |
| Scalar write/read             |       482.00 |          448.50 |  -7.0% |          477.29 |  -1.0% |
| 10,000 distinct pairs         |       682.73 |          626.12 |  -8.3% |          672.65 |  -1.5% |
| 64 scattered definitions      |       809.02 |          706.44 | -12.7% |          749.77 |  -7.3% |
| Prepared write/read           |       271.25 |          272.27 |  +0.4% |          271.67 |  +0.2% |
| hook 10k                      |       630.27 |          622.23 |  -1.3% |          640.46 |  +1.6% |
| observer 10k                  |       538.23 |          526.96 |  -2.1% |          546.81 |  +1.6% |
| tracking 10k                  |       906.23 |          860.65 |  -5.0% |          883.40 |  -2.5% |
| tag toggle 20 queries         |      8708.17 |         8391.60 |  -3.6% |         8631.92 |  -0.9% |
| create 1000 definitions       |      1925.54 |         1919.02 |  -0.3% |         1924.79 |  -0.0% |
| create 1000 pairs             |       369.04 |          353.46 |  -4.2% |          652.23 | +76.7% |

The final Labs comparison classifies large pages as five faster, one slower, and eight neutral, and small pages as one faster, three slower, and ten neutral. It uses Mann–Whitney tests on block medians at α = 0.05 with a 5% practical-effect threshold. The displayed percentage is the ratio of the two median times, which can differ from the classifier’s effect estimate.

Observed writes show no regression for either final pointer layout. The large-page median improves 4.2%, below the practical threshold. Prepared execution is unchanged after resolution. The final large-page construction removes the initial cold-creation regression. Small-page pair creation remains slower in the final run, although its exact magnitude varies substantially across runs.

The machine reported clock drift of 12.6%, 9.4%, and 9.9% across the three runs. The middle run also had large scheduling pauses and clock-confounded cases. The final comparison excluded no cases through its calibration gate, but sparse/pair cases resolve changes only around 7%, and cold creation remains noisy. The scalar and sparse large-page improvements repeat across the runs. These results do not establish a universal speedup.

### Bitmap comparison

The initial matched run compares the bitmap layout against its own baseline:

| Workflow                     | Baseline, µs | Bitmap, µs | Change |
| ---------------------------- | -----------: | ---------: | -----: |
| Scalar write/read            |       476.40 |     585.29 | +22.9% |
| 64 scattered definitions     |       827.50 |     858.17 |  +3.7% |
| Observed writes only         |       368.50 |     375.71 |  +2.0% |
| Resolve 64 dense definitions |        69.40 |      93.90 | +35.3% |
| Destroy 1,024 pairs          |       167.10 |     264.12 | +58.1% |

Bitmap pages retained 89,496 extra bytes in the sparse-definition fixture, versus 558,428 for the initial large pointer pages. They still used more memory than the current compact index, which reuses the existing slot header. Their 22.9% scalar slowdown and 35.3% dense-resolution slowdown show that bitmap compression is not a free addressing shortcut. This does not diminish HiSparseBitSet’s separate use for skipping empty regions during filtering.

[Initial large-page comparison](../src/kernel/benches/archive/descriptor-directory/descriptor-unified-paged-comparison.txt) · [Bitmap comparison](../src/kernel/benches/archive/descriptor-directory/descriptor-unified-bitmap-comparison.txt) · [Final large-page comparison](../src/kernel/benches/archive/descriptor-directory/descriptor-final-paged-fixed-comparison.txt) · [Final small-page comparison](../src/kernel/benches/archive/descriptor-directory/descriptor-final-small-fixed-comparison.txt)

Manual lifetime timing covers descending promotion of 1,024 ordinary entities and shuffled destruction of 1,024 definitions or pairs. Setup and cleanup are outside the timing interval. Their heap intervals include rebuilding the next fixture, so those heap figures are not destruction allocations. Definition destruction and cold creation were noisy and should not be interpreted as precise percentage costs.

## Retained memory

Each sample uses a fresh Node 24.14.0 process and three full GCs with event-loop turns before and after fixture creation. Retained memory is `heapUsed + arrayBuffers`. The two rounds contain 320 samples in total, with eight samples per layout and fixture per round. Raw heap and buffer readings are retained in the artifact. Shared module initialization occurs before the measurement interval.

- Empty measures an initialized context.
- Dense has 10,000 subjects carrying three scalar components each.
- Sparse has 64 definitions separated by 1,023 ordinary entities, with no component data attached.
- Sparse populated adds 10,000 subjects, each carrying one of those 64 scalar components.
- Distinct has the dense scalar fixture plus 10,000 targets and concrete tag pairs.

| Final fixture    | Baseline, bytes | Large pages, bytes | Change | Small pages, bytes | Change |
| ---------------- | --------------: | -----------------: | -----: | -----------------: | -----: |
| empty            |         239,320 |            272,252 | +13.8% |            275,152 | +15.0% |
| dense            |       2,538,128 |          2,580,384 |  +1.7% |          2,573,688 |  +1.4% |
| sparse           |       3,905,384 |          4,468,504 | +14.4% |          3,977,684 |  +1.9% |
| sparse-populated |      59,090,676 |         59,650,320 |  +0.9% |         59,165,400 |  +0.1% |
| distinct         |       7,537,452 |          7,746,920 |  +2.8% |          7,784,860 |  +3.3% |

The final small-page directory adds 72,300 bytes in the sparse-definition fixture, 1.9%, versus 563,120 bytes, 14.4%, for large pages. The large-page increase falls to about 0.9% when the existing sparse component data pages are populated. Smaller leaves cost additional array objects in the distinct-pair fixture and therefore do not win every memory case. All final warm access cases report the same 136-byte median harness allocation per batch.

The sparse populated fixture is large because it retains the current component-page layout. This experiment changes descriptor addressing, not the many mostly empty component data pages. A bitset directory does not compact those value pages.

## Validation and reproduction

All six archived variants passed 317 core tests with one existing expected failure. Additional behavior checks cover reverse promotion across word and page boundaries, compact removal, stable prepared references, slot reuse, reset, partial buffers, NaN values, pair rows, observers, tracking, nested getter writes, and stale handles.

Workspace, isolated kernel, and benchmark types passed, as did scoped formatting and lint. Source patches reconstruct the complete baseline and every variant, with SHA-256 verification. The integrated implementation matches the archived `paged-fixed` runtime, with an updated membership-storage comment. The archived baseline and all experiment measurements remain reproducible. The separate earlier direct-storage report has also been corrected to identify its Node 26 final timing runs accurately.

The integrated layout passes 318 core tests, 46 React tests, 43 Svelte tests, and 307 built-package tests, with only the existing expected failures. The production build also passes. The first built-package run had ten worker startup timeouts. A complete rerun with `--maxWorkers=2` passed. The additional permanent regression covers scattered definitions, removal, stale prepared access, and context reset.

From the repository root, using Node 24.14.0:

```sh
pnpm exec node --import tsx packages/core/src/kernel/benches/support/replay-variants.ts /tmp/koota-descriptor-replay packages/core/src/kernel/benches/archive/descriptor-directory/variants > /tmp/koota-descriptor-sources.json
KOOTA_STORAGE_VARIANTS="$(cat /tmp/koota-descriptor-sources.json)" pnpm exec node --import tsx packages/core/src/kernel/benches/support/check-descriptor-directory.ts
KOOTA_STORAGE_VARIANTS="$(cat /tmp/koota-descriptor-sources.json)" pnpm exec node --import tsx packages/core/src/kernel/benches/support/check-direct-storage.ts
```

The replay destination must not exist. Select `baseline`, `paged-fixed`, and `small-fixed` from the returned source map for the final comparison. Keep `bitmap` for a separate comparison against `baseline`. The initial and intermediate variants are retained to make every measured result reproducible.

From the repository root, with `KOOTA_STORAGE_VARIANTS` set to the selected map:

```sh
KOOTA_STORAGE_CASES=scalar,sparse64,pairs10k,prepared pnpm --filter @koota/core bench "@kernel-direct-storage @kernel-storage-controls @kernel-descriptor-routing" -n descriptor-repeat
pnpm --filter @koota/core bench "@kernel-descriptor-lifetime" -n descriptor-lifetime-repeat
```

For one memory sample, from the repository root:

```sh
pnpm exec node --expose-gc --import tsx packages/core/src/kernel/benches/support/measure-storage-memory.ts kernel /tmp/koota-descriptor-replay/paged-fixed/packages/core/src/kernel/index.ts sparse
```

Repeat each fixture in fresh processes. `KOOTA_STORAGE_CASES` filters the direct-storage cases only. Omit it to include vectors, wide components, and alternating definitions.

[Results artifact](../src/kernel/benches/archive/descriptor-directory/descriptor-directory-results.json) · [Source manifest](../src/kernel/benches/archive/descriptor-directory/variants/sources.json)
