# Relations

Relations build graphs between entities. Use for hierarchies, inventories, targeting, neighbor networks, and any entity-to-entity connection.

## Contents

- [Core Concepts](#core-concepts)
- [Basic Syntax](#basic-syntax)
- [Building Graphs](#building-graphs) - Hierarchies, inventories, targeting, neighbors
- [Querying Relations](#querying-relations) - Specific targets, wildcards, combined queries
- [Traversing Graphs](#traversing-graphs) - Recursive traversal, building trees, finding ancestors
- [Ordered Relations](#ordered-relations) - Maintaining order (experimental)
- [Removing Relations](#removing-relations)
- [Relation Options](#relation-options)
- [React Hooks](#react-hooks)
- [Anti-Patterns](#anti-patterns) - Common mistakes to avoid
- [Common Patterns](#common-patterns) - Scene graphs, inventories, targeting, social graphs

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

Ordered relations maintain a list of related entities with bidirectional sync. Use when order matters (UI layers, rendering order, execution order).

### Why ordered relations?

A regular query returns a flat unordered list:

```typescript
const children = world.query(ChildOf(parent)) // Order not guaranteed
```

Without ordered relations, you'd need to store an order field and sort every time you query. Ordered relations solve this by caching the order on the target.

### Basic usage

```typescript
import { relation, ordered } from 'koota'

const ChildOf = relation()
const OrderedChildren = ordered(ChildOf)

const parent = world.spawn(OrderedChildren)
const children = parent.get(OrderedChildren)

// Array-like interface
children.push(child1) // Adds ChildOf(parent) to child1
children.unshift(child2) // Adds to front
children.splice(0, 1) // Removes first child

// Bidirectional sync
child3.add(ChildOf(parent)) // child3 automatically added to list
```

### Supported methods

**Standard array methods:**

- `push(entity)` - Add to end
- `pop()` - Remove from end
- `shift()` - Remove from front
- `unshift(entity)` - Add to front
- `splice(start, deleteCount, ...items)` - Remove/insert

**Special methods:**

- `moveTo(entity, index)` - Move entity to specific position
- `insert(entity, index)` - Insert at specific position

### Example: UI layer ordering

```typescript
const ChildOf = relation({ autoDestroy: 'orphan' })
const OrderedChildren = ordered(ChildOf)

const scene = world.spawn(OrderedChildren)
const layers = scene.get(OrderedChildren)

const background = world.spawn(ChildOf(scene))
const gameplay = world.spawn(ChildOf(scene))
const ui = world.spawn(ChildOf(scene))

// Render in order (background first, UI last)
function render(world: World) {
  for (const layer of layers) {
    renderLayer(layer)
  }
}

// Reorder dynamically
layers.moveTo(ui, 0) // Move UI to back
```

### Example: Execution order

```typescript
const ChildOf = relation()
const OrderedSystems = ordered(ChildOf)

const pipeline = world.spawn(OrderedSystems)
const systems = pipeline.get(OrderedSystems)

// Define system execution order
systems.push(inputSystem)
systems.push(physicsSystem)
systems.push(renderSystem)

// Run in order
function tick(world: World) {
  for (const system of systems) {
    executeSystem(system)
  }
}
```

### Performance notes

Ordered relations add bookkeeping overhead:

- Cost is paid during structural changes (add, remove, move)
- NOT during query/iteration time
- Use only when order is essential

**When to use:**

- UI layer/z-index management
- System execution order
- Render order
- Any time iteration order matters

**When NOT to use:**

- Order doesn't matter
- Can sort at query time
- Performance-critical hot paths

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

## Common Patterns

### Scene graph / UI hierarchy

```typescript
const ChildOf = relation({ autoDestroy: 'orphan' })
const LocalTransform = trait({ x: 0, y: 0, rotation: 0, scale: 1 })

function getWorldTransform(entity: Entity): { x: number; y: number } {
  const local = entity.get(LocalTransform)!
  const parent = entity.targetFor(ChildOf)

  if (!parent) return { x: local.x, y: local.y }

  const parentWorld = getWorldTransform(parent)
  return {
    x: parentWorld.x + local.x,
    y: parentWorld.y + local.y,
  }
}
```

### Inventory with stacking

```typescript
const Contains = relation({ store: { amount: 0 } })

function addToInventory(inventory: Entity, item: Entity, amount: number) {
  if (inventory.has(Contains(item))) {
    const current = inventory.get(Contains(item))!
    inventory.set(Contains(item), { amount: current.amount + amount })
  } else {
    inventory.add(Contains(item, { amount }))
  }
}

function removeFromInventory(inventory: Entity, item: Entity, amount: number) {
  const current = inventory.get(Contains(item))
  if (!current) return false

  if (current.amount <= amount) {
    inventory.remove(Contains(item))
  } else {
    inventory.set(Contains(item), { amount: current.amount - amount })
  }
  return true
}
```

### AI targeting with priority

```typescript
const Targeting = relation({ store: { priority: 0 }, exclusive: true })

function updateTargeting(world: World) {
  world.query(IsEnemy, Position, Targeting('*')).updateEach(([pos], enemy) => {
    const target = enemy.targetFor(Targeting)
    if (!target || !target.isAlive()) {
      // Find new target
      const player = world.queryFirst(IsPlayer, Position)
      if (player) enemy.add(Targeting(player, { priority: 1 }))
    }
  })
}
```

### Social graph (likes/follows)

```typescript
const Follows = relation()
const Likes = relation({ store: { strength: 0 } })

// Create social connections
userA.add(Follows(userB))
userA.add(Likes(userB, { strength: 0.8 }))

// Query followers
const followers = world.query(Follows(celebrity))

// Query who someone follows
const following = entity.targetsFor(Follows)
```
