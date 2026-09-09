# HiSparseBitSet

`HiSparseBitSet` filters exact integer indices using hierarchical summaries and sparse leaf blocks. It supports intersections and exclusions without scanning empty regions. It does not store values or entity generations.

```ts
import { HiSparseBitSet, collectQueryInto } from '@koota/collections'

const selected = new HiSparseBitSet(4_194_304)
const excluded = new HiSparseBitSet(4_194_304)
selected.reserve(100_000, 101_024)

selected.tryInsert(100_002) // 1, added
selected.tryInsert(100_002) // 0, already present
selected.tryInsert(0) // -1, leaf not prepared
selected.tryInsert(NaN) // -2, invalid index

const required = [selected]
const forbidden = [excluded]
const output = new Uint32Array(128)
const requiredCount = collectQueryInto(required, forbidden, output)
```

Capacity is fixed at creation. The default is 1,048,576 indices, and the maximum is 4,194,304. Zero capacity is valid. Choose a smaller capacity when the address range is known to be smaller. Fixed directories have a cost even when empty. Leaf blocks cover 1,024 indices and are allocated only by creation or preparation operations.

`reserve(start, end)` prepares every leaf intersecting the half-open range. `tryInsert` returns a status and never allocates. Removing or clearing entries retains those blocks for reuse. `insert` is a convenience operation that can allocate a missing leaf. `setRange` can allocate leaves too and returns the number of newly added indices. Neither operation grows the directories. `clone` preserves capacity and preparation in an independent set.

`forEach`, `forEachIntersection`, and `forEachQuery` visit ascending indices without temporary arrays. Reuse the input arrays and callback when calling them repeatedly. Nested read-only filtering is safe and uses no shared scratch. `collectQueryInto` writes only the caller's output capacity and returns the full required count. An empty output still reports that count. An empty required list matches nothing. Different input capacities are allowed.

`collectIntersection` and `collectQuery` allocate snapshots for convenience. `getBlock` exposes borrowed storage for inspection. Its first 32 words contain bits, and word 32 summarizes the nonempty words. Do not modify the borrowed block or the hierarchy fields.

Invalid indices, including NaN, infinities, fractions, negative numbers, and the exclusive capacity boundary, do not alias valid indices. `insert`, `has`, and `remove` return false for them. `tryInsert` returns -2. Invalid capacities and reversed or out-of-bounds ranges throw before mutation. Empty valid ranges do nothing. No epsilon applies to exact integer indices.

Callbacks must not mutate the sets being visited. `drain` removes each entry before invoking its callback. If the callback throws, entries not yet visited remain in the set with valid summaries and size. Read-only nested operations are allowed during draining.

For an entity kernel, these indices represent raw slots. A generation-bearing handle must not be inserted directly. The caller must synchronize filtering membership with entity destruction and slot reuse. The production kernel currently keeps its cached entity query sets, with no additional bitset index to maintain. See the [kernel measurements](../../core/docs/entity-kernel-benchmarks.md) for the filtering comparison and footprint tradeoffs.
