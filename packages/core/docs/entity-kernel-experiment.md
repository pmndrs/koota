# Entity kernel experiment

This is the first measured prototype for an entity-based kernel. It lives in
`src/kernel/experimental/entity-kernel.ts` and is deliberately absent from the
kernel barrel. This report records the pre-rewrite experiment. References to the current kernel below mean that earlier baseline. The [production entity kernel](entity-kernel.md) now implements shared identities using the existing paged global store.

## Model

Entities, trait definitions, relations, and interned relation pairs share one
identity pool. Any live identity can be a subject, a trait, or a pair endpoint.
For example, `attach(kernel, Position, Serializable)` attaches metadata to a
definition. A pair can itself hold metadata or participate in another pair.
Deleting a definition removes its memberships from every subject. Deleting either
pair endpoint destroys the pair and its dependent pairs, without destroying their
subjects.

The inspiration is the local Iris implementation in `Dev/iris/packages/ecs/src`
(`encoding.ts`, `entity.ts`, and `registry.ts`). Iris materializes definitions as
entities but also has separate definition registries, encoded type bits, and pair
encodings. This experiment tests shared identity without copying those layouts.

Identity allocation, membership insertion/removal, scalar reads/writes, pair
interning, deletion, and selection use only storage allocated by the factory.
There are no per-entity records, per-entity sets, per-pair objects, or module scratch
variables. A monomorphic context owns flat columns, explicit allocation counters,
free lists, and a bounded deletion queue. Two doubly linked membership indexes
support removal by subject and by trait. Pair interning uses a bounded linear-probe
table with backward-shift deletion, so churn cannot accumulate tombstones.

Both packed plain arrays and typed arrays implement the same algorithms. Packed
arrays are filled sequentially at creation. Integer columns start with integers,
and scalar values start with double elements. The typed layout uses `Uint32Array`
for indexes and `Float64Array` for scalar values. It does not narrow values to
Float32. No module-level factory calls or scratch allocations are introduced.

## Bounds and observable behavior

- Capacity is explicit at creation. Entity capacity is 0 through 1,048,575,
  including definitions and pairs. Membership capacity is a separate nonnegative
  integer bounded by `2^30 - 1`.
- Handles are local to a context and always in `[1, 2^30)`. Zero means invalid or
  full for `spawn` and `pair`. The slot field uses the next power of two above
  capacity, leaving the remaining bits for generation. At maximum entity capacity
  this provides 1,024 generations. Exhausted slots retire instead of wrapping.
  Retirement can eventually make a context full even with fewer live identities.
- `attach` returns 1 for inserted, 0 for already present, -1 for full, and -2 for
  invalid input. New membership values start at zero. Duplicate insertion
  preserves the existing value. Failed insertion leaves membership unchanged.
  `detach`, `readInto`, `writeFrom`, and `destroy` return whether they succeeded.
  Scalar access copies through caller-owned number arrays or Float64 arrays,
  with a validated offset. Failed reads leave the output untouched.
- Noninteger, zero, negative, nonfinite, out-of-range, and stale handles fail
  validation before indexing. Identities from another context must not be passed
  in, since two contexts can intentionally issue the same number.
- Scalar data preserves NaN, infinities, signed zero, and Float64 precision.
  Membership is independent of value. No tolerance is used because the operations
  use exact identity and membership comparisons. Geometry and vector operations
  are outside this prototype.
- `collect` returns the total matching count and writes at most the existing
  output capacity. A larger count reports truncation without growing the buffer.
  Empty terms match every live identity, including definitions and pairs. An
  invalid term matches nothing. Ordering is unspecified, and unused output entries
  are untouched. Multi-term selection traverses the least populated trait index.
- Deletion uses context-owned workspace and has no recursive calls or user
  callbacks. Independent contexts do not share scratch. Sharing one mutable
  context concurrently across workers is unsupported.

## Measurement

`benches/kernel-entity-model` contains shared workloads and factory-capacity
measurements. Select only these suites:

```sh
KOOTA_ENTITY_MODEL=current pnpm bench '@entity-model' -n entity-model-current
KOOTA_ENTITY_MODEL=packed pnpm bench '@entity-model @entity-capacity' -n entity-model-packed
KOOTA_ENTITY_MODEL=typed pnpm bench '@entity-model @entity-capacity' -n entity-model-typed
KOOTA_ENTITY_MODEL=packed pnpm bench '@entity-lifecycle' -n entity-lifecycle-packed
KOOTA_ENTITY_MODEL=typed pnpm bench '@entity-lifecycle' -n entity-lifecycle-typed
pnpm bench baseline entity-model-current
pnpm bench compare entity-model-packed
pnpm bench baseline entity-model-packed
pnpm bench compare entity-model-typed
```

The current adapter calls the current kernel operations, uses cached query handles,
and reuses the scalar write object. Its numeric definition tokens exist only in
the benchmark adapter. Current definitions do not become entities through that
adapter. All variants use the same workload loops. Entity input buffers are
Float64 because current packed handles can be negative. Snapshots compare counts
and scalar results rather than handle encoding or enumeration order.

The cold population bench includes context creation and capacity/storage
allocation. Warm benches allocate fixtures before measurement. Empty-capacity
benches expose the upfront cost separately. Labs reports allocated bytes per
iteration including typed-array backing stores, rather than just JS heap bytes.
These allocation figures are not retained-heap measurements. The typed model's
backing-store footprint is exactly `68 * (entityCapacity + 1) + 8 * stride +
32 * (membershipCapacity + 1)` bytes, plus context and typed-array objects.

Factory benches release their previous fixture in `after`, before the next
sample's GC. Holding it until replacement can let old typed backing stores be
freed inside the sample, understating the new allocation. Even with that precaution,
Labs memory deltas are observations, not an exact allocation counter. Batched
factory calls and delayed external-memory accounting still undercount typed
allocation in these runs. Use the retained probe and backing-store formula for
footprint, not the typed factory's Labs heap delta. Deletion of a shared target uses
manual timing so Labs cannot batch repeated no-op deletion before `after` restores
the fixture.

The separate `measure-retained.ts` probe runs GC before and after populating
10,000 entities with three scalar memberships. It sums `heapUsed` and
`arrayBuffers`, without also counting `external` (which would double count the
buffers). Imported module state and the entity input buffer predate the baseline.
The model remains live after the second GC. Run each sample in a fresh process:

```sh
KOOTA_ENTITY_MODEL=typed pnpm --filter @koota/benches exec node --expose-gc --import tsx kernel-entity-model/measure-retained.ts
```

Three fresh-process samples on Node 26.1.0, Apple M4 Pro, 2026-09-09:

| Model            | Median retained bytes | Bytes per populated entity |
| ---------------- | --------------------: | -------------------------: |
| Current kernel   |             4,143,648 |                      414.4 |
| Packed prototype |             3,588,664 |                      358.9 |
| Typed prototype  |             1,824,836 |                      182.5 |

These totals include context storage and retained runtime setup for the measured
operations, not just identity bytes. The prototype reserves 10,016 identities and
30,000 memberships. Typed backing stores alone account for 1,772,260 bytes. The
typed model retained about 49% less than the identical packed model in this case.
This is a concrete footprint reason to prefer typed storage for this experiment,
independent of timing. Typed storage is the factory and benchmark default. It does
not imply a 56% memory reduction for a feature-complete replacement of the current
kernel.

V8 native diagnostics confirmed that the packed model's integer columns have Smi
elements without holes, and its value column has double elements without holes.

A fractional-value bench exposed about 156 KB of boxing per 10,000 scalar
round-trips in the initial scalar argument/return interface. The kernel now uses
`readInto` and `writeFrom` with caller-owned buffers so noninteger values do not
need to cross a function boundary as scalar arguments or return values. The
benchmark adapter supplies scalar convenience calls for comparison with current
operations. That adapter is not the proposed hot kernel interface.
The final fractional workload reports 152 bytes per iteration in both storage
layouts, down from 160,152 bytes in the original packed scalar interface. Labs
could not establish a timing change for that interface change because its clock
cross-check rejected the comparison. The allocation reduction is the reason to
keep the buffer operations.

The current kernel has hooks, change tracking, registered queries, deferred
mutations, arbitrary schemas, paged storage, and public lifecycle semantics. The
prototype only has scalar values and uncached positive intersections. Consequently,
current-versus-prototype results measure the foundation and its tradeoffs. They
do not establish an equivalent replacement's speed. Packed-versus-typed results
compare the same features and algorithms.

## Initial runtime results

Medians of eight fresh-process block medians, on the same machine as the retained
probe. Final runs are saved as `entity-model-current-verified`,
`entity-model-packed-buffered`, and `entity-model-typed-buffered`. Each row processes
10,000 entities, except the intersection which returns 5,000 matches.

| Workflow                                        |   Current |    Packed |     Typed |
| ----------------------------------------------- | --------: | --------: | --------: |
| Cold create and populate one scalar membership  |   2.90 ms | 925.15 µs | 280.27 µs |
| Recycle entities with three memberships         |  13.23 ms |   1.27 ms |   1.12 ms |
| Detach, attach, and check membership            |   2.24 ms | 405.17 µs | 413.79 µs |
| Scalar write and read through benchmark adapter | 760.69 µs | 199.71 µs | 182.44 µs |
| Collect intersection into caller buffer         |   2.42 µs |  23.21 µs |  21.94 µs |
| Shared-pair relation membership churn           |  10.23 ms | 407.81 µs | 420.27 µs |

Labs reported five faster foundation workloads and one slower for either
prototype versus current, with matching snapshots. The typed model's intersection
is approximately nine times slower than current cached query reads. Keeping
integer identity does not justify discarding cached membership. The next design
experiment should combine query maintenance with repeated iteration at realistic
read/write ratios.

For the same prototype, Labs reported faster construction, recycling, scalar
access, and intersection with typed storage. Membership and relation churn were
neutral at the 5% practical threshold. The final packed run had 6.9% clock drift,
and the packed-versus-typed comparison reported different clock estimates. The
verdicts above survived Labs' clock cross-check. These are local measurements,
not promises across runtimes or hardware.

The identity-specific benches also expose a typed-storage regression:

| Workflow                                                            |    Packed |     Typed |
| ------------------------------------------------------------------- | --------: | --------: |
| Look up 10,000 existing pairs                                       |  80.02 µs |  46.50 µs |
| Recycle 10,000 pair identities                                      | 660.29 µs | 576.96 µs |
| Delete one target with 10,000 incoming memberships                  | 139.35 µs | 187.25 µs |
| Fractional scalar round-trip through caller buffer, 10,000 entities | 116.81 µs |  68.29 µs |

Target deletion was 34% slower with typed storage and had noisy samples and limited
resolution (about ±14%). Labs still reported a slower verdict. Keep packed storage
available and include target deletion in subsequent comparisons.

Warm prototype mutations reported a median heap delta of 152 bytes per complete
10,000-entity iteration, versus megabytes for current membership/recycling loops.
Query heap delta was approximately 6 bytes versus 43 KiB. These are measured
residuals, so this report does not claim a literal zero-byte result. The source has
no explicit allocations in these operations. Cold packed construction still
allocates about 10.84 MiB in the population workload, more than current, because
sequentially creating packed arrays incurs backing-store growth.

[Recorded results](../../../benches/kernel-entity-model/benchmark-results.json)
include block medians, clocks, memory observations, retained samples, final source
hashes, and comparison output with warnings. Raw Labs results remain in
`benches/.labs/results`. The original benchmark baseline selection was restored.

Validation: all 232 core tests pass with one existing expected failure, including
14 prototype tests covering both layouts. Workspace, kernel-only, and scoped
benchmark type checks pass. Changed code passes formatting and lint checks.

## Migration gates

1. Establish the allocation and timing costs of shared integer identity, flat
   membership, pair interning, and both storage layouts.
2. Resolve query iteration cost before replacing cached query membership. Measure
   query maintenance together with repeated reads, not reads alone.
3. Design schema/store registration, identity ownership across worlds, reservations,
   and explicit capacity planning. Keep callable definitions and snapshot wrappers
   in the API where needed. Only change the operation contract for a measured or
   semantic requirement.
4. Add hooks, reentrant/deferred mutations, tracking baselines, exclusions, relation
   policies, and ordered relations. Re-run kernel contract tests and the relevant
   entity, relation, query, and graph suites at each step.
5. Replace production internals only after equivalent workflows satisfy correctness,
   allocation, footprint, and runtime targets. Arbitrary scalar-loop speedups are
   insufficient evidence for changing the storage contract.
