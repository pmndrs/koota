# Direct storage addressing

Measured follow-up: [Direct storage experiments](direct-storage-results.md).

Yes, the kernel can remove the predicate-record lookup from selected access paths. Truly computing a data address from integers is also possible, but it requires a fixed allocation rule or a handle that identifies a particular piece of data. These are design candidates, not newly measured speedups.

## What needs an address

`read(entity, Health)` supplies two identities. The subject selects a row. The component selects which storage to read. For ordinary traits, Koota already derives the row directly from the subject's slot. For pairs, it finds the subject/pair membership edge and uses that edge as the row.

The extra component resolution currently follows:

```text
component handle -> membership-page header -> predicate record -> component columns
subject handle   -> global slot -> page and offset
```

The predicate record also provides membership masks, schema operations, relation information, versions, and publication behavior. Eliminating its use for addressing does not eliminate those responsibilities.

A directory of column references can replace the record. This removes a separate metadata object from the path, but still performs an array lookup. A layout based entirely on address arithmetic goes further and imposes stronger constraints. In ordinary JavaScript, a Smi is an integer payload rather than an application-accessible pointer to a managed object. [V8 pointer compression](https://v8.dev/blog/pointer-compression)

## 1. Make the component entity slot the storage index

Use a storage directory indexed directly by the component slot:

```text
columns[componentSlot][fieldOrdinal][subjectPage][subjectOffset]
```

This skips the header's dense-record index and the predicate object. Keep schema, lifecycle, and relation metadata separately for operations that need it. Full handle validation remains necessary before using a recycled slot.

A flat directory over all 4,194,304 slots costs roughly 16 MiB with four-byte references or 32 MiB with eight-byte references, before headers and entries. Those are layout calculations, not measured V8 retained sizes. Lazy pointer pages reduce the cost, but add a page lookup and waste entries when predicates are scattered.

One promising variant allocates data-bearing definitions together in a reserved range of global pages. For example, 64 pages reserve 65,536 slots. A single global directory for that range can remain small and avoid duplication per context. Ordinary entities can still become tags outside the range. Pairs can keep a generic path or receive a separate addressing policy.

The range is a placement policy, not an archetype. It does not move subjects when their components change. A fallback outside the range can preserve capacity behavior, at the cost of a second access path. Making the range mandatory would impose a new definition limit and reduce the slots available for other entities.

Membership checks and change publication still need metadata. A data page could carry an occupancy bitset alongside its values, allowing reads to check membership without visiting the predicate record. Keeping the query masks too duplicates some membership state. A 1,024-row occupancy bitset requires 128 bytes per allocated component page, before headers. Relation data would still need an edge lookup unless the caller supplies its row.

This is the first layout candidate I would measure. It targets the actual numeric-handle path while keeping paging and the entity model.

## 2. Compile storage references into the operation

Generate a schema-specific operation that captures its column references directly, rather than loading them through a prepared record on every iteration. A borrowed batch can validate its predicate and subject selection once, then run the generated body over known rows.

This preserves numeric entity identities and paged storage. It moves component selection into code and its captured references. Individual checked calls still need lifetime and membership checks. A borrow can hoist those checks only while structural changes remain deferred.

The costs are generated-code size, closure state, compilation time, and invalidation rules. A generic dispatch table of compiled functions introduces another lookup and may prevent useful inlining. Keeping every compiled operation alive can retain deleted component storage unless invalidation also releases captured references.

This extends the existing prepared and borrowed access model. It is the lowest-risk candidate, but it does not make an arbitrary numeric component handle a direct pointer.

## 3. Make fields entities

Give `Health.value` and `Position.x` their own identities and their own columns. A field handle selects one column directly. Component definitions become groups of field identities, membership rules, and behavior.

The operation becomes:

```text
fieldPages[fieldSlot][subjectPage][subjectOffset]
```

Field metadata can itself carry traits or participate in relations. Definition count grows with schema fields rather than subject count. A whole-component read still needs the field list or compiled code, so this mainly helps callers already operating on a known field.

The public meaning of adding, removing, or destroying a field must be explicit. Preserving atomic component membership is possible by treating fields as dependent resources of the component. Independently editable field membership would be a larger contract change. Per-component hooks still require coordination across fields.

A direct numeric return is not automatically allocation-free in JavaScript. Our scalar prototype already demonstrated that a reusable buffer can have a better heap result. Field entities should be tested with batch or buffer operations as well as scalar returns.

## 4. Make each component attachment a data entity

Create an identity for the particular attachment `(subject, component)`, not just for the component definition. Queries can yield those data identities or their validated rows.

```text
Health attachment handle -> its data slot
```

This takes the entity model further: component instances become entities too. Koota's membership edges already provide a related mechanism for pair data, but those edge rows are currently internal and lack independent entity generations.

To remove component resolution, data must follow a fixed cell layout or the operation must already know the layout. Otherwise the data entity just leads to another descriptor. A shared scalar plane indexed by data slot is one concrete layout. Wider and reference-valued schemas need additional planes or layout-specific operations.

The main cost is identity capacity. With six data-bearing components per subject, representing every attachment as a global entity would use roughly seven slots per subject, excluding definitions and relations. A 4,194,304-slot budget then permits about 599,000 such subjects. Existing membership storage may be reused, so this is not necessarily seven times today's memory, but it is substantially more generation and lifetime bookkeeping.

Removing and reattaching a component invalidates its previous data handle. Converting `read(subject, Health)` into a data handle still requires a membership lookup. The benefit appears when queries or callers already retain those handles. Hooks and observers may need the reverse link back to the subject.

This is the most interesting radical candidate for an entity model without archetype storage. It changes the access contract and capacity budget.

## 5. Fixed address planes or a linear-memory arena

Assign each component field a fixed plane and calculate an offset:

```text
address = plane * subjectCapacity + subjectSlot
```

With the plane encoded in a handle or supplied by compiled code, there is no descriptor lookup. An ArrayBuffer or a WebAssembly memory can hold the numeric data. WebAssembly linear memory is explicitly byte-addressed storage. [WebAssembly overview](https://webassembly.github.io/spec/core/intro/overview.html)

The tradeoff is reserved capacity and layout rigidity. One double-precision field spanning all 4,194,304 slots requires 32 MiB. One hundred such fields require about 3.125 GiB before other state. Lazy component pages avoid allocating all those values, but reintroduce a page directory. Compacting or moving allocations requires changing handles, invalidating them, or restoring an indirection table.

A smaller bounded numeric subsystem is a plausible use. Heterogeneous JavaScript references need a separate reference table. Full generation and ownership validation still read lifetime state, even when the data address is arithmetic. The global entity allocator can remain paged, but the component-storage and interop contracts would change.

## 6. Encode more address information in handles

The current positive Smi layout already uses all 30 bits: 22 slot bits and eight generation bits. More embedded address information must reuse those bits, consume capacity, or change the handle representation.

| Choice                                     | Cost                                                                                          |
| ------------------------------------------ | --------------------------------------------------------------------------------------------- |
| Reserve slot ranges for storage identities | Partitions capacity rather than creating extra bits                                           |
| Use the negative Smi range too             | Adds one payload bit, but conflicts with current negative status values and handle validation |
| Reduce generation bits                     | Exhausted slots retire sooner if stale handles must remain invalid                            |
| Reduce slot bits                           | Lowers the global identity limit                                                              |
| Use wider Number handles                   | Loses the current Smi guarantee and needs different decoding above 32 bits                    |
| Use BigInt or multiple words               | Adds representation and arithmetic costs that need measurement                                |

Embedding a store index still leaves an array lookup. Embedding an arena offset can remove that lookup only if the data follows a compatible allocation rule. Wider handles alone do not solve flexible storage addressing.

Object references are another possibility: an entity object can hold its values directly. That abandons integer-only handles and adds per-entity objects. Flexible component selection still requires slots, properties, or a map inside the object. A fixed universal record avoids that map by reserving space for the supported fields, trading extensibility and sparse memory use for direct access.

## What the existing evidence supports

The current scalar run measured 454.44 µs for numeric access, 275.27 µs for prepared access, and 280.08 µs for Iris. That identifies an opportunity in repeatedly resolving component access, but does not isolate every lookup or predict a new layout's timing. [Scalar results](scalar-access-results.md)

An earlier pointer-page prototype accelerated some numeric value access but regressed distinct-pair presence by about 37% and increased retained memory for sparse definitions by about 15%. Those are results for that prototype, not inherent limits of pointer pages. They show why scalar timing alone cannot select a registry layout. [Metadata experiments](predicate-metadata-results.md)

The direct-field prototype reported roughly 320 KB of temporary heap per 10,000 write/read operations. The selected buffer path achieved comparable prepared timing at the harness's small allocation baseline. Removing a visible intermediate object or buffer is not sufficient evidence of a leaner runtime path.

## Proposed experiment order

First compare the current registry with a direct paged column directory and a directory whose data definitions are clustered into global pages. Keep the checked buffer API, publication semantics, arbitrary tags, full generations, and a fallback for definitions outside the fast region. Measure uniform scalar access, many alternating predicates, sparse definitions, shared and distinct pairs, creation, deletion, and full-GC retained heap plus ArrayBuffers.

Then test storage-capturing compiled batch operations against the existing prepared and borrowed paths. Include many schemas and invalidation churn so code size and retained references are visible.

Only after those results would I select an attachment-entity or arena design. They offer genuinely different addressing, but change capacity or data-access contracts. No new architecture is adopted by this report.
