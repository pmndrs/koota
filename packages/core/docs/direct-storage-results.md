# Direct storage experiments

The adopted descriptor layout is documented in [unified descriptor directories](descriptor-directory-results.md). The results below describe the earlier experiment.

No runtime change was adopted. A bounded column directory improves compact component access, but regresses sparse access, observed writes, and pair creation. Owned attachment entities provide the strongest simplification in the isolated addressing model, with a different lifetime and access contract. The current prepared and borrowed paths remain competitive.

All experiments keep the paged entity allocator. None introduces archetype storage.

## Method

- Apple M4 Pro, Labs 0.9.0. The final kernel and addressing-model timing runs used Node 26.1.0, as recorded in their result files. Earlier confirmation runs, the destruction rerun, and retained-memory measurements used Node 24.14.0. Timing tables use the median of eight fresh-process block medians. Each read/write workload processes 10,000 values.
- The final kernel run had a stable 3.83–3.91 GHz clock and about 1.6% comparison resolution. The final addressing-model run had a stable 3.73–3.86 GHz clock and about 1.1% resolution. Earlier exploratory runs had clock drift and are retained as preliminary evidence.
- Retained memory is `heapUsed + arrayBuffers`, measured after three full GCs in each of eight fresh processes per fixture. There are 384 final memory samples. Tables show medians. Outliers and separate heap/buffer counts remain in the artifact.
- Labs temporary-heap readings include the harness. They are distinct from retained memory. Manual destruction samples include fixture rebuilding in the harness allocation interval, so their heap readings do not represent destruction allocation.
- Iris uses its scalar field API as a reference. Koota uses a reusable Float64 buffer. These are different access APIs, and the Iris fixture also carries one tag. Compare architecture variants within their matched workloads.

## Kernel variants

The directory variants keep ordinary subject slots as data rows and resolve concrete pair rows through the membership index. Storage columns are indexed separately from predicate records. Trait metadata is still needed for membership and publication.

| Prototype                                      | Outcome                                                                                                                                                                                             |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Paged directory                                | Removes the predicate record from data addressing, but adds per-context pointer directories and sparse slack.                                                                                       |
| Flat directory                                 | Small for nearby definitions, expensive for scattered IDs. The initial trait-only route regressed pair fallback access.                                                                             |
| Clustered definitions                          | Reserves 1,024 identities at a time. It changes allocation order and consumes reserved capacity. The retained-memory results did not justify those costs.                                           |
| Captured accessors                             | Generated closures hold columns directly. Prepared scalar access did not improve materially, and each pair retained extra closures.                                                                 |
| Direct pair columns                            | Resolves edge rows directly too. Reading relation information through trait metadata added enough work to hurt ordinary scalar access.                                                              |
| Bounded directory with stamp reuse             | Bounds the directory and reuses type bits from the mandatory validity check. The first version retained duplicated validation before callback fallback.                                             |
| Context window with early fallback (`guarded`) | Anchors a 4,096-slot window around the context’s first storage definitions. Known hook/subscriber paths go to the normal writer before duplicated validation. This is the final measured candidate. |

There are ten archived kernel variants, including intermediate paged-pair and window versions that were validated but not separately timed. None changes the 22-slot-bit / 8-generation-bit handle format. The clustered allocator is experimental and does change reserved-capacity behavior.

### Final matched results

| Workflow                | Current kernel, µs | Direct window, µs | Change |
| ----------------------- | -----------------: | ----------------: | -----: |
| scalar                  |             494.98 |            408.69 | -17.4% |
| vector3                 |             540.56 |            461.56 | -14.6% |
| wide16                  |             858.77 |            768.02 | -10.6% |
| alternating64           |             541.06 |            500.31 |  -7.5% |
| pairs64                 |             607.52 |            541.92 | -10.8% |
| pairs10k                |             659.88 |            687.85 |  +4.2% |
| sparse64                |             721.17 |            802.02 | +11.2% |
| prepared                |             256.79 |            257.65 |  +0.3% |
| hook 10k                |             623.75 |            642.71 |  +3.0% |
| observer 10k            |             519.10 |            551.58 |  +6.3% |
| tracking 10k            |             908.00 |            939.10 |  +3.4% |
| tag toggle 20 queries   |            8392.52 |           8608.58 |  +2.6% |
| create 1000 definitions |            2113.63 |           2102.27 |  -0.5% |
| create 1000 pairs       |             711.46 |            756.60 |  +6.3% |

Labs classified five cases faster, three slower, and six neutral at a 5% minimum effect and α = 0.05. The regressions were sparse definitions, observed writes, and pair creation. The 20-query tag-toggle workflow did not improve. Neutral includes small measured differences and does not mean identical performance.

The same run measured Iris scalar access at 325.40 µs. Current prepared access was 256.79 µs. Borrowed columns with changed publication took 34.38 µs, versus 34.21 µs when their references were captured. Hoisting one more column lookup did not improve that batch materially. All Koota warm read/write cases in this final run reported 152 B per batch, including the harness.

### Kernel retained memory

The dense fixture has 10,000 subjects with three scalar components each. Sparse has 64 unused data definitions separated by 1,023 bare entities, for 65,536 live identities. Distinct adds 10,000 targets and pair identities to the dense component fixture. These sizes include allocator and workspace capacity effects, not just directory pointers.

| Layout               | Dense, bytes | Sparse, bytes | Distinct pairs, bytes |
| -------------------- | -----------: | ------------: | --------------------: |
| Current              |    2,539,720 |     3,905,928 |             7,563,820 |
| Paged                |    2,625,248 |     5,027,832 |             7,656,428 |
| Flat                 |    2,540,568 |     5,142,404 |             7,566,112 |
| Flat including pairs |    2,540,728 |     5,143,800 |             8,113,620 |
| Clustered            |    2,733,652 |     4,817,180 |             7,767,860 |
| Captured             |    2,543,316 |     3,918,372 |             9,308,060 |
| Direct window        |    2,540,872 |     3,983,804 |             7,646,648 |

The bounded window added approximately 77,876 B in the sparse fixture, versus 1,237,872 B for the unbounded directory. Captured accessors added 1,744,240 B in the distinct-pair fixture. The small dense-directory differences are below some individual process outliers. Captured closures could be shared per storage instance to avoid the per-pair duplication. That memory cost belongs to this prototype, not to capturing references in general.

## Addressing models with narrower contracts

These are scalar storage models, not replacement kernels. They omit hooks, queries, change history, arbitrary schemas, and general attachment mutation. They use a private instance of the same paged allocator so arena sizes do not depend on earlier benchmark worlds. Each subject has one scalar attachment. Definitions, fields, and data attachments are real allocator identities when the model requires them. Buffers hold at least one value.

The control resolves a descriptor through a slot-to-row index. Direct columns and field entities index storage arrays with a definition or field slot. Checked attachments validate the cell, owner, and definition. Owned attachments instead cascade destruction and validate one allocator word, including a data-kind bit, before indexing their scalar page. No new handle bits are needed for that model.

| Model            | 3 definitions, µs | 64 definitions, µs | Temporary heap with 3 definitions, B |
| ---------------- | ----------------: | -----------------: | -----------------------------------: |
| descriptor       |            254.71 |             565.79 |                                  152 |
| direct           |            184.29 |             396.35 |                                  152 |
| field            |            184.69 |             411.94 |                                  152 |
| attachment       |            256.62 |             257.50 |                                  152 |
| attachment-owned |            140.75 |             141.33 |                                  152 |
| arena            |            233.67 |             440.33 |                                  152 |
| wide-number      |            260.81 |             649.71 |                               53,480 |
| bigint           |            500.94 |             891.00 |                              960,152 |
| compact-smi      |            212.60 |        Unsupported |                                  152 |
| object           |            261.31 |             256.02 |                                  152 |

Owned attachment handles reduced isolated point-access time by 44.7% against the descriptor control, and by 23.6% against direct columns. With 64 definitions, compacting values into shared scalar pages also improves locality. The gain is not solely one fewer pointer load.

Starting from an owner still costs a lookup. The checked-attachment case that resolves the owner on each read and write took 1119.94 µs. Its owner-to-cell table is an optimistic one-attachment mapping, not a general multi-component membership lookup.

| Model            | Dense model, bytes | Sparse model, bytes |
| ---------------- | -----------------: | ------------------: |
| descriptor       |          1,614,492 |          14,921,152 |
| direct           |          1,614,968 |          16,142,412 |
| field            |          1,615,060 |          16,142,312 |
| attachment       |          2,075,432 |           8,877,556 |
| attachment-owned |          2,082,292 |           8,877,400 |
| arena            |          1,536,944 |       Not allocated |
| wide-number      |          1,536,948 |          46,798,868 |
| bigint           |          1,750,504 |          47,037,912 |
| compact-smi      |          1,537,024 |         Unsupported |
| object           |          2,528,628 |           9,317,692 |

The dense model has 10,000 subjects spread across three definitions, one scalar per subject. The sparse model adds 65,472 intervening bare identities and spreads values across 64 definitions. It is intentionally different from the kernel memory fixture above.

Owned attachments used 29.0% more retained memory in the dense model and consumed 20,003 identities instead of 10,003. Creating them took 933.23 µs versus 590.54 µs for direct storage, approximately 58.0% more time.

The sparse attachment model saves memory because one shared scalar plane replaces many mostly empty component pages. That is a fixed-layout advantage. Supporting heterogeneous data and several attachments per subject needs more storage and ownership machinery.

| Destroy 10,000 subjects |      µs |
| ----------------------- | ------: |
| direct                  |  752.69 |
| field                   |  728.58 |
| attachment              |  740.17 |
| attachment-owned        | 1383.29 |
| object                  |  748.77 |
| arena                   |  736.02 |

Owned attachment destruction also destroys the data identities. The checked-link model leaves those identities allocated until teardown and rejects them through owner/definition validation. These rows demonstrate where the work moves, not equal cleanup contracts.

### Architectural tradeoffs

- **Field entities:** no meaningful scalar access improvement over direct columns in this model. They may improve expression and reflection, but that is an API choice rather than a demonstrated addressing optimization.
- **Owned attachment entities:** the most promising radical option. It requires queries/callers to retain data identities, a known value layout, and ownership cleanup. A full implementation must define publication and query behavior. Six attachments per subject would consume roughly seven identities per subject before other definitions and relations, reducing the current global budget to about 599,000 subjects.
- **Arena:** the measured implementation uses Float64Array storage, not Wasm. Dense bounded planes are compact, but sparse IDs reserve huge gaps. The raw sparse arena would require about 39 GB of payload and is rejected by the prototype’s 256 MiB limit. Compact plane selectors avoid those ID gaps but still reserved about 39 MB of numeric payload in the tested sparse fixture.
- **Wider Number and BigInt handles:** encode the plane with the full definition identity. They did not beat direct columns and introduced temporary heap in the measured calls. BigInt was particularly expensive. These are results for these implementations, not a general claim about every wider-handle implementation.
- **Compact Smi handles:** the prototype uses 20 slot bits, eight generation bits, and two plane bits. That limits it to four planes and reduces definition slot capacity. It did not beat direct columns. Sign-only encoding was not separately benchmarked because it provides classification, not a storage address.
- **Object handles:** direct scalar fields did not compensate for validation and per-attachment object cost in this model. Retained memory was higher.

## Decision and validation

Keep the current kernel for now. The bounded directory is a reproducible candidate for workloads with nearby definitions and few observers, but the measured regressions prevent selecting it as a general replacement. Captured accessors, field identities, and wider packing did not justify a migration. Owned data entities deserve a separate contract experiment if their capacity and lifetime changes are acceptable. Their 141 µs result must not be presented as a full-kernel result.

The refined pair directories, bounded/stamp/window/guarded variants, and captured accessors passed 317 core tests with one existing expected failure. All 20 addressing-model scenarios passed, covering empty populations, page boundaries, NaN values, removal, slot reuse, owner/definition destruction, and teardown. Additional numeric-path checks covered pair rows, short buffers, observers, tracking consumption, nested getter writes, and stale handles.

The clustered allocator passed 98 kernel tests and failed the test that requires a specific slot-reuse order. Its placement policy remains an intentional experimental contract difference. Six destruction-benchmark cases initially used an unsupported Labs setup hook, failed before measuring the operation, and were rerun with the correct lifecycle. Those failed samples are excluded.

Workspace package types, scoped benchmark types, formatting, and lint passed. Archived source patches were reconstructed from the recorded baseline and verified by SHA-256. The workspace kernel source still matches the original baseline.

## Reproduce

Use the same Node version for both sides of each comparison. The final kernel and addressing-model timing tables require Node 26.1.0 to match the recorded runtime. From the repository root:

```sh
pnpm exec node --import tsx packages/core/src/kernel/benches/support/replay-variants.ts /tmp/koota-storage-replay > /tmp/koota-storage-sources.json
KOOTA_STORAGE_VARIANTS="$(cat /tmp/koota-storage-sources.json)" pnpm exec node --import tsx packages/core/src/kernel/benches/support/check-direct-storage.ts
pnpm exec node --import tsx packages/core/src/kernel/benches/experiments/storage-models/check-storage-models.ts
```

The replay command requires a new destination directory. It reconstructs the recorded baseline from the Git commit plus its archived patch, then creates all variants. For a focused comparison, pass only `baseline` and `guarded` entries in `KOOTA_STORAGE_VARIANTS`:

```sh
KOOTA_STORAGE_VARIANTS='{"baseline":"/tmp/koota-storage-replay/baseline/packages/core/src/kernel/index.ts","guarded":"/tmp/koota-storage-replay/guarded/packages/core/src/kernel/index.ts"}' pnpm --filter @koota/core bench "@kernel-direct-storage @kernel-direct-batch @kernel-storage-controls" -n storage-repeat
pnpm --filter @koota/core bench "@kernel-storage-models @kernel-storage-lifetime" -n storage-models-repeat
pnpm exec node --expose-gc --import tsx packages/core/src/kernel/benches/support/measure-storage-memory.ts kernel /tmp/koota-storage-replay/guarded/packages/core/src/kernel/index.ts sparse
pnpm exec node --expose-gc --import tsx packages/core/src/kernel/benches/support/measure-storage-memory.ts model attachment-owned dense
```

Repeat memory commands in fresh processes for each sample. Add `IRIS_SOURCE=/path/to/iris/packages/ecs/src/index.ts` to include Iris. The saved results contain block medians and all final memory samples.

[Results artifact](../src/kernel/benches/archive/direct-storage/direct-storage-results.json) · [Kernel comparison](../src/kernel/benches/archive/direct-storage/storage-guarded-guarded-comparison.txt) · [Source patches and hashes](../src/kernel/benches/archive/direct-storage/variants/sources.json)
