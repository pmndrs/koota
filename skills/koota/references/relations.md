# Relations

Relations build graphs between entities. Use for hierarchies, inventories, targeting, neighbor networks, and any entity-to-entity connection.

## Contents

- [Core Concepts](#core-concepts)
- [Basic Syntax](#basic-syntax)
- [Building Graphs](#building-graphs) - Hierarchies, inventories, targeting, neighbors
- [Querying Relations](#querying-relations) - Specific targets, wildcards, combined queries
- [Traversing Graphs](#traversing-graphs) - Recursive traversal, building trees, finding ancestors
- [Ordered Relations](#ordered-relations) - Maintaining order
- [Removing Relations](#removing-relations)
- [Relation Options](#relation-options)
- [React Hooks](#react-hooks)
- [Anti-Patterns](#anti-patterns) - Common mistakes to avoid

## Core Concepts

A relation connects a **source** entity to a **target** entity. The source owns the relation.

```
┌─────────┐  ChildOf(Parent)  ┌─────────┐
│  Child  │ ─────────────────▶│ Parent  │
│ (source)│                   │ (target)│
└─────────┘                   └─────────┘
```

The child expresses the relationship, not the parent. This enables efficient batch queries for all children of a parent.

## Basic Syntax

```typescript
import { relation } from 'koota'

// Basic relation (no data)
const ChildOf = relation()

// Relation with data
const Contains = relation({ store: { amount: 0 } })

// Auto cleanup when target destroyed
const ChildOf = relation({ autoDestroy: 'orphan' })

// Only one target allowed per entity
const Targeting = relation({ exclusive: true })
```

## Building Graphs

### Hierarchies (parent-child)

```typescript
const ChildOf = relation({ autoDestroy: 'orphan' })

const parent = world.spawn()
const child = world.spawn(ChildOf(parent))
const grandchild = world.spawn(ChildOf(child))

// Destroying parent destroys entire subtree
parent.destroy() // child and grandchild also destroyed

// The destroyed children keep their parent until their id is reused, see queries.md Removed
world.query(createRemoved()(ChildOf), ChildOf(parent)).forEach((child) => child.targetFor(ChildOf))
```

### Inventories (contains)

```typescript
const Contains = relation({ store: { amount: 0 } })

const inventory = world.spawn()
const gold = world.spawn()
const sword = world.spawn()

inventory.add(Contains(gold, { amount: 100 }))
inventory.add(Contains(sword, { amount: 1 }))

// Update amount
inventory.set(Contains(gold), { amount: 50 })

// Read amount
const data = inventory.get(Contains(gold)) // { amount: 50 }
```

### Targeting/Following

```typescript
const Targeting = relation({ exclusive: true })

const enemy = world.spawn()
const player = world.spawn()
const otherPlayer = world.spawn()

enemy.add(Targeting(player))
enemy.add(Targeting(otherPlayer)) // Replaces previous target

enemy.has(Targeting(player)) // false
enemy.has(Targeting(otherPlayer)) // true
```

### Neighbor Networks

```typescript
const NeighborOf = relation()

// Build bidirectional connections
entityA.add(NeighborOf(entityB))
entityB.add(NeighborOf(entityA))
```

## Querying Relations

### Query children of specific parent

```typescript
const children = world.query(ChildOf(parent))

for (const child of children) {
  // Process each child
}
```

### Query all entities with any relation (wildcard)

```typescript
// All entities that are children of something
const allChildren = world.query(ChildOf('*'))

// All entities that contain something
const allContainers = world.query(Contains('*'))
```

### Query relation targets by query

```typescript
import { createQuery } from 'koota'

// Children whose parent matches IsPlayer
const playerChildren = world.query(ChildOf(IsPlayer))

// Children whose parent matches multiple traits
const activePlayerChildren = world.query(ChildOf(IsPlayer, IsActive))

// Reuse a cached target query in hot paths
const activePlayers = createQuery(IsPlayer, IsActive)
const cachedChildren = world.query(ChildOf(activePlayers))
```

These target-query filters stay live. If a target gains or loses the traits required by the filter, cached queries and `onQueryAdd`/`onQueryRemove` subscriptions update automatically.

### Get targets from an entity

```typescript
// Get all targets
const items = entity.targetsFor(Contains) // Entity[]

// Get first target
const target = entity.targetFor(Targeting) // Entity | undefined
```

### Combined queries

```typescript
// Enemies targeting the player
const threats = world.query(IsEnemy, Targeting(player))

// Children of parent that also have Position
const positionedChildren = world.query(ChildOf(parent), Position)
```

## Traversing Graphs

### Recursive traversal

```typescript
function traverseFromNode(world: World, node: Entity, depth = 0) {
  console.log('  '.repeat(depth) + `Node ${node.id()}`)

  const children = world.query(ChildOf(node))
  for (const child of children) {
    traverseFromNode(world, child, depth + 1)
  }
}

// Start from root
traverseFromNode(world, root)
```

### Building a tree

```typescript
function buildTree(world: World, parent: Entity, depth: number, maxDepth: number) {
  if (depth >= maxDepth) return

  for (let i = 0; i < 3; i++) {
    const child = world.spawn(ChildOf(parent))
    buildTree(world, child, depth + 1, maxDepth)
  }
}

const root = world.spawn()
buildTree(world, root, 0, 4)
```

### Finding ancestors

```typescript
function getAncestors(entity: Entity): Entity[] {
  const ancestors: Entity[] = []
  let current = entity.targetFor(ChildOf)

  while (current) {
    ancestors.push(current)
    current = current.targetFor(ChildOf)
  }

  return ancestors
}
```

## Ordered Relations

Ordered relations store an explicit order on the target. Changes to the view and relation stay in sync.

```typescript
import { ordered, relation, trait } from 'koota'

const Position = trait({ x: 0 })
const ChildOf = relation()
const OrderedChildren = ordered(ChildOf)
const parent = world.spawn(OrderedChildren)
const childA = world.spawn(Position)
const childB = world.spawn(Position)
const children = parent.get(OrderedChildren)!

children.add(childA) // Adds ChildOf(parent)
childB.add(ChildOf(parent)) // Appends childB
children.moveTo(childB, 0) // Order: childB, childA
```

The trait holds a `MutableOrderedView`. Duplicate additions do nothing, and edits notify the parent's ordered trait.

Select traits to update them in child order. Every child must have the selected traits.

```typescript
children.select(Position).each((position, child, index) => {
  position.x = index * 100
})

const first = children.at(0)
const ids = children.map((child) => child.id())
const snapshot = children.toArray()
```

Edit membership and order through the original view:

```typescript
children.insert(childA, 0) // Moves an existing child to index 0
children.sort((a, b) => a.get(Position)!.x - b.get(Position)!.x)
children.reverse()
children.remove(childA) // Removes ChildOf(parent)
children.clear() // Removes all ChildOf(parent) pairs
```

Adding the ordered trait collects existing children. Removing it leaves their relations intact. Each walk keeps the sequence it started with.

Ordering work happens when children are added, removed, or reordered. Use [sorted queries](queries.md#ordered-views) when trait values determine the order.

## Removing Relations

### Remove specific relation

```typescript
entity.add(Likes(apple))
entity.add(Likes(banana))

entity.remove(Likes(apple))

entity.has(Likes(apple)) // false
entity.has(Likes(banana)) // true
```

### Remove all relations of a kind (wildcard)

```typescript
entity.add(Likes(apple))
entity.add(Likes(banana))

entity.remove(Likes('*'))

entity.has(Likes(apple)) // false
entity.has(Likes(banana)) // false
```

## Relation Options

| Option        | Value                    | Effect                                |
| ------------- | ------------------------ | ------------------------------------- |
| `store`       | `{ field: default }`     | Attach data to the relation           |
| `autoDestroy` | `'orphan'` or `'source'` | Destroy sources when target destroyed |
| `autoDestroy` | `'target'`               | Destroy targets when source destroyed |
| `exclusive`   | `true`                   | Entity can only have one target       |

## React Hooks

```typescript
import { useTarget, useTargets } from 'koota/react'

// Get first target (reactive)
const parent = useTarget(entity, ChildOf)

// Get all targets (reactive)
const items = useTargets(inventory, Contains)
```

## Anti-Patterns

### ❌ Storing the parent reference manually

```typescript
// Don't do this - duplicates what relations provide
const Transform = trait({
  x: 0,
  y: 0,
  parent: null as Entity | null, // ❌ Bad
})
```

```typescript
// Do this instead
const ChildOf = relation()
const child = world.spawn(Transform, ChildOf(parent))
const parent = child.targetFor(ChildOf) // ✅ Good
```

### ❌ Using arrays to track children on the parent

```typescript
// Don't do this - manual bookkeeping, error-prone
const Parent = trait({
  children: () => [] as Entity[], // ❌ Bad
})
```

```typescript
// Do this instead - query for children
const ChildOf = relation()
const children = world.query(ChildOf(parent)) // ✅ Good
```

### ❌ Forgetting autoDestroy for hierarchies

```typescript
// Dangerous - orphans left behind when parent destroyed
const ChildOf = relation() // ❌ Missing autoDestroy
```

```typescript
// Safe - children cleaned up automatically
const ChildOf = relation({ autoDestroy: 'orphan' }) // ✅ Good
```

### ❌ Multiple relations when exclusive is needed

```typescript
// Bug-prone - entity can target multiple
const Targeting = relation()
enemy.add(Targeting(playerA))
enemy.add(Targeting(playerB)) // Now targeting both! ❌
```

```typescript
// Correct - only one target allowed
const Targeting = relation({ exclusive: true })
enemy.add(Targeting(playerA))
enemy.add(Targeting(playerB)) // Replaces playerA ✅
```

### ❌ Querying without wildcard when you want all

```typescript
// This finds nothing - no specific target provided
const allChildren = world.query(ChildOf) // ❌ Wrong
```

```typescript
// Use wildcard to query all entities with any target
const allChildren = world.query(ChildOf('*')) // ✅ Correct
```
