# Kernel boundary audit

The world entity, initial world traits, `IsExcluded`, and public entity-event
filtering now belong to the API. Kernel initialization and reset create no
entities. Optional query exclusions are a generic engine configuration supplied
by the caller.

Query resolution, subscriptions, iteration, command counts, and context reads now
cross an operation contract with opaque handles. Page layout caches belong to the
API. Inline relation queries apply the same exclusions as cached queries. React
and Svelte use revision accessors instead of inspecting kernel records.

The remaining candidates below are recommendations.

## Completed storage simplifications

The [entity kernel](entity-kernel.md) removes the unused trait-instance `notQueries`
set and duplicate schema metadata. Ordinary entities no longer own trait sets.
Integer membership edges represent trait and pair attachments, while cached query
sets use bounded hash indexes independent of the magnitude of an entity handle.
The existing paged global store remains in use. See the [benchmark report](entity-kernel-benchmarks.md)
for measured costs and remaining tradeoffs.

The prepared execution cleanup consolidates change publication, spawn initialization, ordinary trait removal, entity storage preparation, and borrowed entity iteration. Query compilation is separate from workspace borrowing. See [execution ownership](kernel-boundary.md#execution). Public operations and lifecycle timing remain unchanged.

## Cleanup measurements

Eight fresh-process Labs blocks compare a frozen pre-cleanup source tree with the
cleanup. The initial 35-case run included Iris controls and showed clock drift.
A focused benchmark interleaves before and after cases within one schedule to
check the apparent scalar-write and prepared-mutation regressions.

A shared row-write helper slowed prepared value writes by about 10 percent. Numeric
and prepared writes therefore keep separate validation and execution paths, while
sharing change publication. Direct publication also avoids resolving a pair a
second time after its membership has already been validated.

Final medians per 10,000 entities:

| Workflow                               |    Before |     After | Difference |
| -------------------------------------- | --------: | --------: | ---------: |
| Numeric value write and read           | 636.40 µs | 642.31 µs |      +0.9% |
| Prepared value write and read          | 414.38 µs | 409.21 µs |      -1.2% |
| Prepared tag toggle, no queries        |  1.253 ms |  1.269 ms |      +1.3% |
| Prepared tag toggle, 20 cached queries | 19.623 ms | 19.658 ms |      +0.2% |

Labs classifies all four as neutral at its 5 percent minimum-effect threshold.
Per-invocation median heap deltas remain 152 bytes, or 200 bytes with 20 cached
queries. One tag-toggle block had high tail latency, so this does not establish
equivalent tail latency.

Full-GC retained memory for 10,000 entities remained about 2.96 MB with three
scalar fields, 5.30 MB with seven cached queries, and 3.57 MB with seven full-size
query workspaces. ArrayBuffer retention was identical for each before/after
shape. Plan-only heap readings varied substantially across processes, so their
median difference is not evidence of a memory saving.

[Timing results](../../../benches/kernel-iris/cleanup-results.json) retain source
fingerprints, block medians, heap statistics, and Labs comparisons, including the
rejected shared-write candidate. [Retained-memory results](../../../benches/kernel-iris/cleanup-memory-results.json)
include all 64 fresh-process samples. Reproduce the focused suite with
`KOOTA_BEFORE_SOURCE=<frozen-before>/packages/core/src/kernel/index.ts pnpm bench @kernel-cleanup -n cleanup`.
The source snapshot must include the core source tree and its package dependencies.

## Query lifecycle corrections

Tracking queries record or invalidate every affected event group before evaluating
membership. Added and Changed require a still-attached trait. Reattachment cancels
Removed and old Changed events. Every AND group must match and at least one OR
group must match when present. First population seeds complete and partial groups
from history and uses the same static, tracking, and relation matcher as live
updates. Pending partial groups survive reads until they match or are invalidated.

Bare spawns initialize static negative queries without creating tracking events.
Destruction clears tracker bits, snapshots, dirty masks, and change masks for the
released slot. This prevents history from crossing entity generations, including
queries first compiled after reuse. A context keeps an explicit set of tracking
queries for lifetime cleanup. Entity and component storage remain paged.

Query construction publishes the instance to the cache and trait indexes only
after successful population. If a target query throws, subscriptions installed by
the failed construction are removed. Relation-only snapshots apply the same
implicit-entity and context-exclusion filters as cached queries.

Eight fresh-process Labs blocks per variant measured these corrections on 10,000
entities. First tracking population fell from 1.47 ms to 574 µs. Tracked tag toggle
and consumption rose from 1.87 ms to 1.99 ms, about 7 percent. Tracked destruction
rose from 2.71 ms to 3.49 ms, about 29 percent, because histories and query trackers
must be cleared before slot reuse. These correctness costs are retained.

Relation-only snapshots with one implicit definition and no hidden matching source
measured 31 µs versus 35 µs before the fixes. An initial implementation filtered
every source and measured 129 µs. Probing the smaller hidden set removes that
unnecessary pass. Changed-value timings were noisy and do not establish a speedup.

Full-GC retained memory was about 2.68 MB for one scalar and one tag per entity in
both versions. With one populated Added query and reserved tracker pages it rose
from 3.11 MB to 3.22 MB. Initial population now retains tracker state, including
partial groups that were previously lost. [Results and reproducible measurements](../../../benches/kernel-iris/query-lifecycle-results.json)
include all block medians, heap samples, source fingerprints, and limitations.

## Larger decisions

**Allocator and registry ownership.** [Kernel context lifecycle](../src/kernel/context.ts)
uses the global [universe](../src/kernel/universe.ts) for allocation and registration.
Finalization now belongs to the world API, and cleanup tokens retain their original
allocator and registry. Query descriptors still use the global universe for caching.
Explicit allocator and registry inputs at context creation would make
isolated runtimes possible. Numeric entity methods still need to resolve an
entity's owning context, so this requires an ownership design rather than just
moving the singleton into the API.

**Tracking lifecycle.** [Kernel initialization](../src/kernel/context.ts) creates
masks for every global tracking ID. [Kernel tracking modifier creation](../src/kernel/query/tracking-cursor.ts)
also initializes masks across every registered context. Allocation therefore
depends on tracking IDs created elsewhere. Prefer an explicit kernel operation
for establishing a tracking baseline in a context. Moving allocation to first
query use would change what counts as added or removed, so settle baseline timing
before changing this behavior.

**World readiness.** [createWorld](../src/api/world/world.ts) still allocates a
kernel context immediately. Truly lazy allocation would require API-owned
pre-initialization subscriptions, a stable world identity, and defined behavior
for reads before initialization. The ownership boundary now permits that design,
but does not implement it.

## Boundaries worth keeping

- Commands, lifecycle timing, storage, query matching, and relations remain
  engine responsibilities, even when they depend on one another internally.
- Trait initialization and registration callbacks are generic extension points.
  [Ordered relations](../src/api/relation/ordered.ts) supply their implementation
  without kernel imports of `OrderedList`.
- Scheduling remains external. Immediate operations and `flush` provide execution
  without introducing a kernel run loop.

## Remaining compatibility constraints

Opaque handles isolate engine records, but shared trait and query descriptors,
the direct-storage APIs, and legacy diagnostics still expose some representation.
A storage rewrite must preserve `getStore()` and `getPages()` semantics or explicitly
change those APIs. A rewrite of internal indexes, command encoding, or matching
can remain behind the current operation contract.

The public `world.traits` set and `world.id` also retain their existing behavior.
Removing legacy `universe`, `TraitInstance`, and `TraitData` exports would close the
remaining diagnostic escape hatches, but is a separate public compatibility decision.

## Enforcement

The kernel has no external package or API imports. `check:kernel` catches relative imports outside the kernel. Oxlint enforces
API barrel imports and prevents adapters from depending on the legacy registry.
The opaque types reject direct access to context, query, buffer, and cleanup
records. Kernel-only tests check the handle contract and engine interoperability.
