# Scoped identifier experiment

Branch: `feat/identifier-scopes`, based on `canary` at `1e0d99a7`.
The initial experiments below used `200ef4b0`.

```ts
const ChildOf = relation({ exclusive: true })
const Name = identifier({ scope: ChildOf })

const robot = world.spawn(Name('robot'))
const arm = world.spawn(Name('arm'), ChildOf(robot))
world.spawn(Name('motor'), ChildOf(arm))

world.lookup(Name('robot'), Name('arm'), Name('motor'))
world.lookup(robot, Name('arm'), Name('motor'))
```

An identifier chooses one parent relation. Keys are unique in their immediate scope by default,
with root scope used when no parent is present. Queries still match local names across scopes.
Moves validate every identifier attached to the relation before changing any mapping. Paths can
mix identifier types, including a global numeric robot ID followed by local names.

This experiment uses Flecs-style cascading deletion for relations selected as identifier scopes.
Selecting a scope also requires an exclusive relation and enforces acyclicity. See the
[identifier API](../../../docs/api/identifiers.md#scoped-identifiers) for the full contract.

## Comparison with current canary

`identifier-scopes-canary-pr` compares the branch with `canary` at `1e0d99a7`, using eight
interleaved process blocks, assertions compiled off, Apple M4 Pro and Node 24.14.0. The baseline
implementation is unchanged. Only the new benchmark file is copied into its checkout.

Canary does not support scoped identifiers. Both sides therefore use shared, unscoped names
and explicit nested relation queries for this comparison. The fixture has 32 robots, 128 arms
and 1024 parts. Every timed batch moves all arms away from their matching paths and back.
Values are median block timings divided by 256 mutations.

| Cached leaf paths | Canary reparent | PR reparent | Reduction |
| ----------------- | --------------: | ----------: | --------: |
| 0                 |        0.065 µs |    0.066 µs |   Neutral |
| 1                 |        0.136 µs |    0.111 µs |     18.3% |
| 128               |       21.018 µs |    4.315 µs |     79.5% |
| 1024              |       85.466 µs |    6.376 µs |     92.5% |

The two larger reparent cases are 4.9x and 13.4x faster, with p < 0.001. Renaming parents with
128 and 1024 cached paths improves by 15.7% and 17.5%. Across all 41 comparisons, including
flat identifiers, entity and relation mutations, machines and concrete-target queries, Labs
classifies 10 as faster and 31 as neutral at its 5% change threshold. The largest positive
median shift is +3.8% for adding and removing a trait on a child, classified neutral.

Paired clock drift was 8.3%. Comparison resolution for the two large reparent cases was about
±11% and ±9%, well below the observed gains. Neutral results do not establish exact parity.
Saved results are `1e0d99a-dirty` and `identifier-scopes-canary-pr`. The earlier scoped-feature
comparisons below use different baselines and should not be read as comparisons with current canary.

## Earlier scoped-feature measurements

Apple M4 Pro, Node 24.14.0, macOS arm64. Published code with assertions compiled off. The saved
run `identifier-scopes-verified` uses four fresh process blocks per benchmark, interleaved across
implementations and with `canary` for existing mutation cases. Values below are batch means
divided by 4096 lookups or 1024 moves. The preceding `identifier-scopes-final` run used eight
blocks and found similar lookup timings.

| Operation                                      |    Koota | Handwritten maps |
| ---------------------------------------------- | -------: | ---------------: |
| Three-key path, fresh identifier terms         |  33.4 ns |          19.0 ns |
| Three-key path, reused identifier terms        |  32.0 ns |          19.0 ns |
| Three-key path, missing leaf, fresh terms      |  34.3 ns |          20.3 ns |
| Known parent plus local key                    |  12.3 ns |          11.2 ns |
| Reparent an entity and maintain its name index | 231.4 ns |         168.7 ns |

Known-parent lookup is close to the handwritten map, with about 1 ns of additional work. Reused
terms measured 11.4 ns in that case. Full paths remain about 1.7 to 1.8 times slower, with roughly
13 to 14 ns of additional work per lookup. Reparenting is about 37% slower than manually
maintaining an index alongside the relation.

The hand-written lookup reference is an independent nested `Map` hierarchy over the same entity
handles and keys. It is a lower bound for reads and has no automatic lifecycle integration. The
mutation reference checks destination uniqueness and changes the same ECS relation, but does not
implement cycle protection, multiple identifier namespaces, or automatic identifier query and
event maintenance. These comparisons do not claim feature parity.

Treat these values as approximate, especially differences of a few percent. The eight-block run
had 1.8% clock drift and about ±6.2% comparison resolution. The final targeted comparison reported
6% clock drift between paired baseline and candidate blocks. Fresh-term path allocation varied
with JIT tiering in the earlier run. The final run's heap diagnostic was a constant 80 bytes per
entire three-key batch, with no per-lookup allocation observed after warmup.

## Query composition

The pre-optimization `identifier-scope-query-verified` run measures query composition on
the same Apple M4 Pro and Node 24.14.0, with assertions compiled off. Eight fresh process blocks
are interleaved across variants. Its fixture has 32 robots, four arms per robot and eight named
parts per arm, for 1024 parts. Each part has `Position`.

Known-parent queries use `Name(part), ChildOf(parent), Position`. Full paths use
`Name(part), ChildOf(Name(arm), ChildOf(RobotId(robot))), Position`. The lookup reference resolves
the same entity and checks `has(Position)` so every variant applies the same component filter.
These numbers include that filter and use a different fixture from the lookup-only table above.

Each read batch visits 1024 distinct requests and consumes the number of correct entity matches.
Queries are registered and validated before timing. These are steady reads of the first entity,
excluding initial registration and component iteration or updates.

| Operation                        | Known parent + name | Robot ID + arm + part |
| -------------------------------- | ------------------: | --------------------: |
| Lookup followed by has(Position) |             23.1 ns |               53.1 ns |
| Inline query, then at(0)         |            306.2 ns |              511.5 ns |
| Cached query, then at(0)         |             16.6 ns |               17.3 ns |
| Cached queryFirst                |             10.6 ns |               10.4 ns |

Cached reads use the maintained result set, so they do not traverse the path again. The inline
form reconstructs and hashes its terms to find the cached query. Its heap diagnostic estimated
643 bytes per known-parent call and 1362 bytes per full-path call. Cached variants had only
constant measurement overhead per batch, with no per-read allocation observed.

### Maintaining cached paths

Mutation batches rename or reparent all 128 arms away from their queried paths and back, for
256 mutations per batch. Both directions are timed in every sample. The zero-query case retains
all identifier indices, so its cost includes normal scoping maintenance. Queries have no user
subscriptions. Assertions check departing results before timing and final membership, names
and parent relations after measurement.

| Cached leaf paths in the scene | Rename an arm | Reparent an arm |
| ------------------------------ | ------------: | --------------: |
| 0                              |      0.125 µs |        0.171 µs |
| 1                              |      0.133 µs |        0.227 µs |
| 128                            |      1.844 µs |       15.665 µs |
| 1024                           |      3.799 µs |       60.476 µs |

The one-query case observes a single leaf under one of the 128 arms. The 128-query case observes
one leaf per arm, and the 1024-query case observes all eight leaves per arm. Values are means
per mutation averaged across every arm and both directions, rather than the latency of updating
one particular subscribed arm. Intermediate queries are shared where their conditions match.

These measurements exposed the query-maintenance scaling problem. A parent change checked the
relation's broad query list, including queries for unrelated robots. Nested target-query
membership changes also revisit children. The reparent optimization below narrows the first
part of that work.

For repeated reads, retain a `createQuery(...)` reference and call `world.query(ref)` or
`world.queryFirst(ref)`. Direct lookup suits changing or occasional paths. Inline query key
reuse remains a separate optimization opportunity.

The run reported 0.2% clock drift and about ±3.9% overall comparison resolution. All correctness
checks passed. Treat nanosecond differences between the cached variants' path depths as noise.
The earlier four-block `identifier-scope-query-perf` run alternated mutation directions between
samples, producing bimodal rename timings. The final benchmark includes both directions in
every sample and is the source of the tables above.

### Reparent dispatch optimization

A query requiring `Name('motor')` cannot match an entity named `arm`. Static queries that require
both an identifier key and a relation now use the existing identifier-key query index when that
relation changes. Each relation keeps a list of the identifier types needed for this dispatch.
The first required identifier selects candidate queries, and normal matching checks the rest of
their conditions. Tracking queries and relation filters without a required positive pair retain
their existing dispatch. Assignment and query cleanup continue to use the same key index.

`identifier-scope-query-reparent-final` compares this implementation with an exact snapshot of
the preceding worktree at `/private/tmp/koota-query-reparent-base-jhhlp5wm`. Both implementations
run interleaved in one session, with eight fresh process blocks each. Saved results are
`200ef4b-dirty-2` and `identifier-scope-query-reparent-final`. This table uses the median block
timing divided by 256 mutations, rather than the means in the original table above.

| Cached leaf paths | Reparent before | Reparent after | Reduction |
| ----------------- | --------------: | -------------: | --------: |
| 0                 |        0.162 µs |       0.162 µs |   Neutral |
| 1                 |        0.220 µs |       0.210 µs |       ~5% |
| 128               |       16.114 µs |       4.888 µs |     69.7% |
| 1024              |       66.451 µs |       7.053 µs |     89.4% |

The two larger cases improved by about 3.3x and 9.4x, with p < 0.001. All eight read cases and
all four rename cases were classified neutral. The final heap diagnostic for reparenting 1024
paths matched the baseline at 299208 bytes per 256-mutation batch. An earlier candidate allocated
a callback for each query check, which the final implementation replaces with a direct loop.

Clock drift between paired blocks was 2.3%. The 1024-path baseline had about ±10% comparison
resolution, well below the observed improvement. Small neutral differences should not be read
as proof of exact parity.

Queries sharing a local name across scopes still need their remaining conditions checked. This
optimization avoids scanning queries for unrelated keys and adds no whole-path index. Narrowing
dispatch to individual scopes would require a more involved dependency model.

All 524 published-build tests passed. New regression cases cover multiple identifier types,
mixed positive and negative relation filters, and a query callback that destroys its old target
and reparents again during dispatch.

The separate `identifier-scope-query-reparent-regression` comparison checked ordinary entity
mutations, relation mutations, queried-parent upkeep and concrete-target queries against the
same snapshot. All 15 cases were classified neutral, with median shifts from -2.0% to +3.1%.
Paired clock drift was 6.9%, so the run does not establish exact parity. Ordinary relation
add/remove retained the baseline's 80-byte batch allocation diagnostic.

## Optimizations

The initial implementation measured 50.9 ns for fresh three-key paths, 41.8 ns for reused paths,
and 15.6 ns for known-parent lookup. The final implementation separates root and scoped lookup,
indexes parent buckets through paged entity storage, and keeps two- and three-key paths in fixed
arguments. Longer paths use a loop outside that short path. This reduces intermediate allocation
and keeps the functions within the build's existing inlining budgets.

The initial and final runs were separate sessions, so their roughly 21 to 34% improvements are
exploratory measurements rather than an interleaved comparison. Parent buckets remain in a map
for query seeding and cleanup, with a paged table pointing to the same buckets for lookup. This
uses extra references to avoid hashing the parent entity on every lookup.

## Existing-operation regression check

The broad `@name @relation` comparison covered 35 matching cases. It found a 22.5% regression
when adding and removing an ordinary trait on a child, plus temporary allocations in ordinary
relation add/remove. Scope-specific handling was moved out of the plain trait removal path and
into separate relation and identifier helpers.

The targeted `@upkeep @mutation` follow-up classified all ten existing-operation cases as neutral.
Median changes ranged from -2.2% to +2.0%, including +1.3% for the formerly regressed child case.
Ordinary relation add/remove returned to the baseline's 80-byte batch allocation measurement.
The clock drift noted above limits precision, so neutral results do not establish exact parity.

## Reproduce

Compare against the same canary revision with the common benchmark fixture:

```sh
git worktree add ../koota-canary-perf 1e0d99a7
cp benches/api/named-entities/scoped-identifier-queries.bench.ts ../koota-canary-perf/benches/api/named-entities/
pnpm bench --against ../koota-canary-perf '@identifier-query-reparent @name @upkeep @mutation @query-targets' --blocks 8 -n identifier-scopes-canary-pr
```

Earlier experiment runs:

```sh
pnpm bench '@identifier-scope' -n identifier-scopes-final
pnpm bench '@identifier-scope-query' --blocks 8 -n identifier-scope-query-verified
pnpm bench --against /private/tmp/koota-query-reparent-base-jhhlp5wm '@identifier-scope-query' --blocks 8 -n identifier-scope-query-reparent-final
pnpm bench --against /private/tmp/koota-query-reparent-base-jhhlp5wm '@upkeep @mutation @query-targets' --blocks 4 -n identifier-scope-query-reparent-regression
pnpm bench --against /path/to/koota-base '@name @relation' --blocks 4 -n identifier-scopes-regression
pnpm bench --against /path/to/koota-base '@identifier-scope @upkeep @mutation' --blocks 4 -n identifier-scopes-verified
pnpm typecheck
pnpm test:build
```

The source benchmark checks every lookup against its expected entity outside the timed region
and consumes the returned hit count inside the timed region. Reparenting checks the resulting
relation and index contents after measurement. Saved raw results live in `benches/.labs`.

## Verification

- Typecheck passed.
- All 588 source tests and 561 published-build tests passed, including 21 scoped-identifier tests.
- Changed-file formatting and lint passed with existing warnings in relation and trait code.
- Assertions-off checks passed for collisions, cycles, root detachment, foreign scopes,
  cascading deletion, recycled handles, and reset.
