# Archetype graph

The universe owns a canonical graph of trait sets. Each node contains a stable ID within that graph, a sorted list of trait IDs, a canonical string key, and cached add/remove edges.

Adding A then B reaches the same node as adding B then A. Adding an existing trait or removing an absent trait returns the current node. A new transition looks up or creates the destination by its sorted trait IDs and connects the inverse edge. Repeated transitions only look up the cached edge.

This follows the separation in the [Flecs table graph](https://github.com/SanderMertens/flecs/blob/master/src/storage/table_graph.c): canonical component sets establish identity, and edges cache structural transitions. Koota's nodes contain definition data rather than storage tables.

## Query integration

Queries walk the graph for their unconditional required traits. A relation filter contributes its base relation trait, while its target stays outside the graph. Tracking and boolean modifiers keep their existing matching semantics and do not become unconditional requirements.

Plain trait queries use the destination node's canonical key directly. Filtered queries walk a bounded cache for their modifiers and relation filters, then select the required trait-set node's ID. Both paths are resolved in one pass through the parameters, so positive trait orderings no longer allocate separate query trie paths.

Each query instance records its `requiredArchetype`. Multiple queries can share this node while applying different filters. A required set describes a subset of an entity's traits, so querying A and B still matches entities with A, B, and C.

Explicit query references retain separate ordered parameter layouts under the same membership hash and numeric query ID. This keeps `readEach` and `updateEach` tuples in the caller's order. Relation filters contribute no tuple values and can reuse a layout when their pair objects are recreated.

## Lifetime and scope

The graph stores numeric trait IDs, never entity targets or trait objects. Nodes and transitions live until the universe is reset. Worlds share these definitions but own their query instances, matching entity sets, masks, and stores.

The filter cache is capped at 1,024 entries and rebuilt on demand. Changing concrete relation targets cannot create archetype nodes. Explicit query references remain in the universe's query cache, while inline concrete-target queries remain world-scoped.

This integration uses the graph for query identity. Entity trait changes still update bitmasks and affected query sets. The add/remove transition API is available for a later integration with entity membership without changing the definition of a canonical trait set.
