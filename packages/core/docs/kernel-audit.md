# Kernel boundary audit

The world entity, initial world traits, `IsExcluded`, and public entity-event
filtering now belong to the API. Kernel initialization and reset create no
entities. Optional query exclusions are a generic engine configuration supplied
by the caller.

The remaining candidates below are recommendations, not changes made in this pass.

## Small simplifications

| Finding                                      | Evidence                                                                                                                                                                                                                   | Recommendation                                                                                                                                                                          |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Page iteration cache belongs to the API      | `QueryInstance.layoutCache` and `QueryLayoutCache` live in [kernel query types](../src/kernel/query/types.ts), but only [API query results](../src/api/query/query-result.ts) build and consume the cache.                 | Keep it in API-owned query metadata. Preserve version-based invalidation and benchmark page iteration before choosing the lookup structure.                                             |
| Trait instances allocate an unused set       | `TraitInstance.notQueries` is constructed by [registerTrait](../src/kernel/trait/trait.ts) and has no consumers. `KernelContext.notQueries` is a separate, active set.                                                     | Remove the unused instance field and its allocation.                                                                                                                                    |
| Trait instances duplicate schema metadata    | [TraitInstance.schema](../src/kernel/trait/types.ts) copies the definition schema, with two readers in [trait handlers](../src/kernel/commands/handlers/trait.ts).                                                         | Read the canonical trait definition instead and remove the duplicate field.                                                                                                             |
| Public query resolution repeats kernel logic | [world.query and subscriptions](../src/api/world/world.ts) repeat cache lookup and creation already handled by `resolveQueryInstance` and `resolveQueryInstanceFromRef` in [kernel queries](../src/kernel/query/query.ts). | Expose a narrow query-resolution operation and let the API focus on result adaptation. Review the relation-only fast path at the same time, since it bypasses default query exclusions. |

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
masks for every global tracking ID. [API tracking modifier creation](../src/api/query/modifiers.ts)
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

## Enforcement

The kernel's only package imports are collection primitives. It has no API
imports. `check:kernel` uses TypeScript's root directory to catch relative imports
outside the kernel. The stated API barrel-only rule is not automatically enforced
and a few inline type imports still bypass it. A focused import rule would make
that contract enforceable without inventing another runtime abstraction.
