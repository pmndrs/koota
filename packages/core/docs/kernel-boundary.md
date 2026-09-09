# Kernel boundary

`src/kernel` owns ECS data and execution. `src/api` makes that engine convenient
to use. The package entry re-exports `api/index.ts`.

The dependency direction is `api -> kernel`. The API imports the engine contract
from `src/kernel/index.ts`. The kernel never imports the API or installs public
entity methods. Its entity and membership indexes are kernel-owned primitives.

## Ownership

| Kernel                                                  | Public API                                                    |
| ------------------------------------------------------- | ------------------------------------------------------------- |
| `KernelContext`, initialization, reset, destruction     | `WorldContext`, world facade, action cache, reset subscribers |
| Numeric entity handles, allocation, generations         | Entity methods and subscription input adapters                |
| Canonical trait definitions, registration, storage      | Trait hook signatures using public entities                   |
| Relation storage, reverse indexes, cascade cleanup      | Callable relations, ordered-list wrappers                     |
| Query descriptors, matching, tracking, entity snapshots | Modifier helpers, typed query results, sorting and page views |
| Buffer data, recording, interpreter, mutation handlers  | Command-buffer factory and convenience methods                |
| Lifecycle timing and callback execution                 | Public callback signatures                                    |

Traits have one type and one runtime value shared by the kernel and public API.
The kernel creates callable traits, so `Position({ x: 1 })` produces a tuple
containing that same trait. The public API does not allocate a facade or copy
metadata. Shared blueprint IDs and schemas live under `$internal`. Each registered blueprint also has a real definition entity in its context. Native kernel operations use that entity as the predicate.

The kernel creates callable relations. Public relation types add rich call signatures to those same descriptors.
Mutation handlers read trait metadata and relation descriptors directly. API adapters expose numeric handles as entities with convenience
methods without allocating entity wrappers.

`WorldContext` holds `kernel`, `worldEntity`, `actionInstances`, and
`resetSubscriptions`.
Actions initialize against a public world and remain entirely in the API.
Framework bindings use `getQueryVersion(world, query)` and
`getTraitVersionSource(entity, trait)`. Reading a query revision neither initializes
a world nor creates or drains a query. Trait revision sources remain stable for
one registration and are replaced when a world resets.

The world API creates its backing entity, applies initial world traits, and
recreates the entity after reset. World-targeted commands resolve to this entity
before reaching the kernel. Framework bindings read it from
`world[$internal].worldEntity`.

A standalone kernel starts and resets with no entities or registered traits.
It emits spawn and destroy events for ordinary entities and explicitly exposed definitions. Implicit definitions acquire a spawn event when exposed. The world API filters those
events according to its public conventions.

`IsExcluded` is defined in the API. The world supplies it through the kernel's
optional `queryExclusions` configuration. Those traits become default forbidden
terms, including in relation target queries. Exclusions are fixed for the context's
lifetime and do not suppress kernel lifecycle events. A standalone kernel has no
default exclusions, and a query with no parameters matches every exposed live entity.

`createWorld()` still allocates an uninitialized kernel context. Deferring that
allocation entirely is a separate lifecycle change.

`universe.contexts` contains registered kernel contexts, indexed by the cleanup
token's `contextId`. The API currently exposes that ID as `world.id`. Each token
retains its original allocator and context registry, so delayed cleanup cannot
affect a replacement universe.

The world API owns `worldFinalizer`, its registration, and unregistration on
explicit destruction. The kernel exposes `releaseKernelResources(token)` for
idempotent cleanup without hooks or subscriptions. It releases only pages still
owned by that token, advances entity generations, invalidates command buffers,
and removes the context from its original registry. Explicit `world.destroy()`
still performs the full lifecycle.

The kernel contains no finalizer. Another interface can choose explicit disposal
without opting into garbage-collection cleanup.

Ordered traits supply initialization and registration callbacks. This allows the
kernel to initialize stored values and invoke setup behavior without importing
`OrderedList` or its relation synchronization implementation.

## Execution

Execution modules have separate responsibilities:

| Domain                                             | Owner                                                          |
| -------------------------------------------------- | -------------------------------------------------------------- |
| Entity slots, generations, and storage preparation | `entity/entity-index.ts`                                       |
| Definition and pair identities                     | `entity/definitions.ts`                                        |
| Prepared predicate resolution and bounded access   | `entity/prepared-access.ts`                                    |
| Numeric predicate resolution and value buffers     | `entity/values.ts`                                             |
| Spawn initialization and membership changes        | `commands/handlers/entity.ts` and `commands/handlers/trait.ts` |
| Single-row and batch change publication            | `commands/handlers/changed.ts`                                 |
| Query-plan compilation and matching                | `query/query-plan.ts`                                          |
| Workspaces, borrowed selections, and column visits | `query/visit.ts`                                               |

Numeric and prepared entry points validate and resolve their different inputs, then share execution where the behavior agrees. Ordinary and prepared spawns share negative-query initialization. Cached and planned entity visits share one borrow implementation. Value writes keep separate numeric and prepared hot paths, sharing change publication. Batch publication retains its explicit timing and history-mask optimization. These paths use direct calls and caller-owned workspaces, without allocating callback adapters.

Lifecycle and command-buffer validation failures use branded kernel errors with
stable codes. The world and command-buffer APIs translate these into public
messages and retain the original error as `cause`. Translation does not inspect
message text or unbranded `code` properties. Unexpected exceptions and ordinary
errors thrown by application hooks pass through unchanged.

The kernel keeps the validation, so direct engine callers receive the same
invariant protection. Other engine errors still use their existing messages.

The kernel can be created and exercised independently:

```ts
import {
  createKernelContext,
  initializeKernel,
  destroyKernel,
  createTrait,
  createEntity,
  setTrait,
  queryInternal,
} from '../src/kernel'

const ctx = createKernelContext()
initializeKernel(ctx)
const Position = createTrait({ x: 0 })
const entity = createEntity(ctx, Position)
setTrait(ctx, entity, Position, { x: 2 })
const entities = queryInternal(ctx, Position) // Plain numeric array
destroyKernel(ctx)
```

Immediate operations and buffered playback share handlers. Scheduling remains
external. Kernel queries can return snapshots, fill caller buffers, or synchronously lend cached entity arrays through `visitQuery`. The kernel owns query resolution,
subscriptions, iteration, storage writes, and change tracking. The API adds typed
`readEach` and `updateEach` methods, selection, sorting, and page views. Page layout
caches live in an API-owned WeakMap keyed by the query handle.

The boundary does not imply allocation-free execution. Component registration,
page growth, snapshots, default values, and callback payloads may allocate.
Cached query membership uses packed integer arrays and capacity-managed hash indexes.
Snapshot calls copy once. Prepared native operations use explicit capacities and
status results. See [the entity kernel contract](entity-kernel.md).

## Operation contract

Prepared access, query plans, query workspaces, and spawn plans also use opaque handles. Their allocation, lifetime, and publication rules are specified in [prepared execution](prepared-execution.md).

The kernel barrel exposes opaque context, query, command-buffer, and cleanup-token
handles. Only engine modules see their record fields. `interface.ts` gives the
original functions signatures that accept and return handles. These are type-only
views of the same objects and functions, with no runtime wrappers or extra handle
allocations. Engine factories validate their complete record shapes before adding
the type-only identities.

API code invokes operations rather than indexing entity pages, inspecting query
maps, editing subscriptions, or decoding command-buffer words. Ordered-list
synchronization uses the same trait access and subscription operations.

This boundary supports replacing internal indexes, command encoding, matching,
and mutation execution while preserving the operation contract and lifecycle
semantics. It does not make every public representation interchangeable:

- Traits, relation descriptors, and query descriptors remain shared definitions.
- `getStore()` and `getPages()` promise direct access to paged storage. Their
  ordinary component storage shapes and entity addressing remain paged. Relation
  columns are now paged by membership edge slot and require pair access operations.
- `world.traits` exposes a live set, and `world.id` still reflects context identity.
- The legacy `universe` and deprecated `TraitInstance` exports expose diagnostics
  that depend on engine records. They are compatibility escape hatches, not an
  interface for adapters. The deprecated `QueryInstance` export is now opaque.

## Enforcement

`pnpm --filter @koota/core check:kernel` compiles the kernel independently with
`src/kernel` as its TypeScript root. This catches relative dependencies on API
source files. Oxlint restricts API imports to the kernel barrel and prevents
runtime adapters from importing the legacy registry. Framework bindings cannot
import engine modules or the legacy engine record exports from core.

`kernel-tests/interface.test.ts` checks opaque handle types and interoperability
with engine records. Typechecking API code catches direct record access.

`kernel-tests/kernel.test.ts` exercises the engine without importing the public
package entry. `trait-identity.test.ts` checks interoperability between the layers.
Public behavior remains covered by `tests/`, which also runs against the built
package. Kernel-only tests are not copied into the published-package test suite.

See [the boundary audit](kernel-audit.md) for remaining simplification candidates.
