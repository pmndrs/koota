# Kernel boundary

`src/kernel` owns ECS data and execution. `src/api` makes that engine convenient
to use. The package entry re-exports `api/index.ts`.

The dependency direction is `api -> kernel`. The API imports the engine contract
from `src/kernel/index.ts`. The kernel never imports the API or installs public
entity methods. Its collection primitives come from `@koota/collections`.

## Ownership

| Kernel                                                  | Public API                                                      |
| ------------------------------------------------------- | --------------------------------------------------------------- |
| `KernelContext`, initialization, reset, destruction     | `WorldContext`, world facade, action cache, reset subscribers   |
| Numeric entity handles, allocation, generations         | Entity methods and subscription input adapters                  |
| Canonical trait definitions, registration, storage      | Trait hook signatures using public entities                     |
| Relation storage, reverse indexes, cascade cleanup      | Callable relations, ordered-list wrappers                       |
| Query descriptors, matching, tracking, entity snapshots | Modifier helpers, typed query results, iteration and page views |
| Buffer data, recording, interpreter, mutation handlers  | Command-buffer factory and convenience methods                  |
| Lifecycle timing and callback execution                 | Public callback signatures                                      |

Traits have one type and one runtime value shared by the kernel and public API.
The kernel creates callable traits, so `Position({ x: 1 })` produces a tuple
containing that same trait. The public API does not allocate a facade or copy
metadata. Trait IDs and schemas live only under `$internal`.

Public relations add call signatures to structural kernel descriptors.
Mutation handlers read trait metadata and relation descriptors directly. API adapters expose numeric handles as entities with convenience
methods without allocating entity wrappers.

`WorldContext` holds `kernel`, `worldEntity`, `actionInstances`, and
`resetSubscriptions`.
Actions initialize against a public world and remain entirely in the API.
Framework bindings read query versions through `world[$internal].kernel`.

The world API creates its backing entity, applies initial world traits, and
recreates the entity after reset. World-targeted commands resolve to this entity
before reaching the kernel. Framework bindings read it from
`world[$internal].worldEntity`.

A standalone kernel starts and resets with no entities or registered traits.
It emits spawn and destroy events for every entity. The world API filters those
events according to its public conventions.

`IsExcluded` is defined in the API. The world supplies it through the kernel's
optional `queryExclusions` configuration. Those traits become default forbidden
terms, including in relation target queries. Exclusions are fixed for the context's
lifetime and do not suppress kernel lifecycle events. A standalone kernel has no
default exclusions, and a query with no parameters matches every live entity.

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

Lifecycle and command-buffer validation failures use branded kernel errors with
stable codes. The world and command-buffer APIs translate these into public
messages and retain the original error as `cause`. Translation does not inspect
message text or unbranded `code` properties. Unexpected exceptions and ordinary
errors thrown by application hooks pass through unchanged.

The kernel keeps the validation, so direct engine callers receive the same
invariant protection. Other engine errors still use their existing messages.

The kernel can be created and exercised independently:

```ts
import { createKernelContext, initializeKernel, destroyKernel } from '../src/kernel/context'
import { createTrait } from '../src/kernel/trait/create-trait'
import { createEntity, setTrait } from '../src/kernel/commands/operations'
import { queryInternal } from '../src/kernel/query/query'

const ctx = createKernelContext()
initializeKernel(ctx)
const Position = createTrait({ x: 0 })
const entity = createEntity(ctx, Position)
setTrait(ctx, entity, Position, { x: 2 })
const entities = queryInternal(ctx, Position) // Plain numeric array
destroyKernel(ctx)
```

Immediate operations and buffered playback share handlers. Scheduling remains
external. Kernel queries return snapshots, and the API adds `readEach`,
`updateEach`, selection, sorting, and page views.

The boundary does not imply allocation-free execution. Component registration,
page growth, snapshots, default values, and callback payloads may allocate.
Query membership uses plain sparse-set data and standalone functions, with one
snapshot copy when a query runs.

## Enforcement

`pnpm --filter @koota/core check:kernel` compiles the kernel independently with
`src/kernel` as its TypeScript root. This catches relative dependencies on API
source files. It does not enforce the API's barrel-only import rule or prohibit
package imports.

`kernel-tests/kernel.test.ts` exercises the engine without importing the public
package entry. `trait-identity.test.ts` checks interoperability between the layers.
Public behavior remains covered by `tests/`, which also runs against the built
package. Kernel-only tests are not copied into the published-package test suite.

See [the boundary audit](kernel-audit.md) for remaining simplification candidates.
