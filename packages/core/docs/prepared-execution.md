# Prepared kernel execution

See [measurements against Iris](prepared-execution-results.md) for timing, allocation, retained memory, and remaining tradeoffs.

Prepared operations resolve numeric definitions once, reuse caller storage, and keep the global paged entity store. Definitions and concrete relation pairs remain entity identities. Adding or removing a predicate never moves the subject's other columns.

## Preparing a workload

```ts
const ctx = createKernelContext()
initializeKernel(ctx)
const Position = defineTrait(ctx, { x: 0, y: 0 })
const Moving = defineTrait(ctx)
const position = prepareEntityAccess(ctx, Position)
const spawn = prepareSpawnPlan(ctx, [Position, Moving])
const selection = prepareQueryPlan(ctx, [Position, Moving])
const workspace = createQueryWorkspace(10_000)
const entities = new Uint32Array(10_000)

// Definitions occupy entity slots too
reserveKernel(ctx, 10_002, 20_000)
const created = trySpawnBatch(spawn, entities)
visitQueryColumns(
  selection,
  position,
  workspace,
  (_entities, rows, columns, count) => {
    const x = columns[0]
    for (let i = 0; i < count; i++) {
      const row = rows[i]
      x[row >>> 10][row & 1023] += 1
    }
  },
  'changed'
)
```

Create definitions, intern pairs, prepare accesses and plans, register observers and trackers, then reserve. Repeat reservation after adding schemas, eager queries, or trackers. Handles are opaque type views of engine records, without wrapper allocation.

`prepareEntityAccess` caches one access record per predicate in its context. It resolves the schema, mask generation, and columns. `hasPreparedTrait`, `readPreparedValues`, `writePreparedValues`, `tryAttachPrepared`, and `detachPrepared` bypass descriptor parsing and definition lookup. They still validate subject ownership, generation, and predicate lifetime. A bare relation supports presence checks and query terms. Data and attachments require a concrete pair.

Reads return the required field count, write only the output capacity, and return `-1` for absent or invalid data. Writes require the complete row and return false before writing if input is short or invalid. Schema order determines field order. Tags have zero fields and reference traits have one. Numeric values retain double precision, including NaN and infinities. No tolerance applies to integer identity or membership checks.

`tryAttachPrepared` returns `1` for an addition, `0` when already present, `-1` for insufficient membership or column preparation, and `-2` for invalid identities, aggregate relations, or nested mutation. `detachPrepared` returns false when absent, invalid, or nested. Inside a visit, use deferred identity operations for structural edits. Prepared value writes are allowed inside visits and preserve per-entity publication.

## Query plans and workspaces

`prepareQueryPlan(ctx, all, { none, any, includeImplicit })` compiles exact predicates into masks and concrete pair tests. Empty `all` matches exposed live entities. Empty `any` imposes no alternative requirement. Context exclusions still apply. An identity in both `all` and `none` produces no matches. A destroyed referenced predicate invalidates the whole plan, including forbidden and alternative terms. Reset and resource release invalidate it too. Plans never follow replacement definitions.

Plans have no mutation subscriptions, tracking history, or eager result set. `collectQueryPlanInto` searches on every call, writes the fitting prefix, and returns the required count. `-1` means invalidated. It never grows the output. Order is unspecified.

Search uses the least populated required predicate when its user count is less than a quarter of the live entity count. Otherwise it scans the dense alive list, avoiding a long linked user list for dense selections. Existing eager queries use the same candidate index for initial population, sorting candidate dense rows to preserve their previous initial order. No signature table or archetype graph is needed for this path.

`createQueryWorkspace(capacity)` allocates fixed entity and column-row buffers. `visitQueryPlan` refreshes its selection after a structural revision and reuses it for data-only changes. Any structural change in the context invalidates the cached selection. This conservative policy costs one context revision increment rather than per-plan mutation work. Predicate counts add four bytes per prepared entity slot.

Visits return the required count and skip the callback when empty or over capacity. Invalid plans return `-1`. Nested visits require separate workspaces. Reborrowing a busy workspace throws. Structural edits defer until the outer mutation finishes. Workspaces never resize. Retaining many workspaces trades memory for repeated-read speed. One workspace can serve multiple plans when caching all results is unnecessary.

## Borrowed columns and publication

`visitQueryColumns` requires an access explicitly present in the plan's `all` terms. The callback receives selected entities, storage rows, schema-ordered paged columns, and count. Ordinary rows use entity slots. Pair rows use membership edges. The workspace refreshes both after structural changes.

This is a trusted low-level interface. Use only the first `count` entries, leave entity and row buffers unchanged, and write only selected values. Do not retain the borrow or replace, resize, or rearrange pages. A read callback must not write. TypeScript does not enforce deep immutability of column values.

| Policy           | Trait version                                                     | Hooks, change observers, and tracking                       |
| ---------------- | ----------------------------------------------------------------- | ----------------------------------------------------------- |
| `read` (default) | Unchanged                                                         | None                                                        |
| `silent`         | Advanced once                                                     | None                                                        |
| `changed`        | Invalidated before the callback, then advanced for published rows | Each selected entity is published after callback completion |

With `changed`, all raw writes finish before per-entity hooks and observers run. Hooks can further edit their rows, so an early observer can see later rows before their hooks have run. Structural commands remain deferred. With no per-entity consumers, publication marks history masks directly, advances the version in one step, and skips row dispatch. History is retained even for a tracking query compiled later. Consumer presence is checked after the callback so newly added observers are honored.

If a callback or publication hook throws, raw writes remain and queued structural edits are discarded. Write modes have already invalidated the trait version. Remaining notifications do not run, and the workspace is released. This is a borrow boundary, not a transaction.

These explicit modes extend the kernel contract. Existing cached queries retain immediate membership maintenance, subscriptions, and tracking. Existing value operations retain per-write publication order.

## Bulk creation

`prepareSpawnPlan` compiles a fixed initial predicate set, removes duplicates, and budgets shared relation-presence memberships once. Conflicting exclusive targets are rejected during preparation.

`trySpawnBatch(plan, output, count = output.length)` creates a fitting prefix and returns its count. It returns `0` when preparation is insufficient, `-1` for an invalidated plan, and `-2` for nested execution. Invalid counts throw before mutation. Output never grows and entities use schema defaults. Prepared pair columns must cover the reserved edge pool.

Hooks and spawn notifications still run per entity. Their structural commands play after the whole batch, so output handles may already be dead on return if a hook queued destruction. A thrown hook leaves completed work in place and discards queued edits. Eager query maintenance still runs for each initial attachment.

Factories, hooks, observers, tracking histories, and deferred payloads may allocate. Fixed capacity covers prepared primitive storage and caller buffers, not arbitrary callback work. Initialization, compilation, and explicit reservation are allocation phases.
