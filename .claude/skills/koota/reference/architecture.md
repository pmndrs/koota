# Architecture and File Structure

## Core Principle

Decompose classes into traits (data) and actions (behavior) unless there is a specific reason to use a class.

## Conventions Override

Examples below use common conventions. Always follow the user's stated preferences or existing codebase conventions (file naming, casing, structure) over these examples.

## Standard Structure

Separate core (pure TypeScript) from view (React/framework code):

```
src/
├── core/                   # Pure TypeScript, ECS with Koota
│   ├── traits/
│   ├── systems/
│   ├── actions/
│   └── world.ts
│
├── features/               # View layer, organized by domain
│   ├── enemies/
│   ├── terrain/
│   └── ui/
│
├── utils/                  # Generic, reusable
│
├── App.tsx
└── main.tsx                # Entry point
```

## Organize by Role, Not Feature

Organize `core/` by role (traits, systems, actions), not by feature slice. Traits and systems are composable across features.

## Data modeling

**Prefer multiple entities over array traits.** Instead of one entity with a flat array of objects, spawn many entities with shared traits.

```typescript
// ❌ Singleton with array — harder to query, compose, and extend
const Inventory = trait(() => ({ items: [] as { id: string; count: number }[] }))
const inventory = world.spawn(Inventory)

// ✅ Multiple entities — queryable, composable, per-item traits
const Item = trait({ id: '', count: 0 })
const IsInInventory = trait()
world.spawn(Item({ id: 'sword', count: 1 }), IsInInventory)
world.spawn(Item({ id: 'potion', count: 5 }), IsInInventory)

// Query all items
world.query(Item, IsInInventory)
```

**Why multiple entities:**

- **Queryable** — filter, sort, iterate with `query()`
- **Composable** — add traits per-item (e.g., `IsEquipped`, `IsDamaged`)
- **Extensible** — new behaviors without changing existing traits
- **Reactive** — React hooks work per-entity, not per-array-element
- **Graphs** — use relations to connect entities (e.g., `ChildOf`, `Contains`, `DependsOn`)

## Detailed Example

```
src/
├── core/
│   ├── traits/
│   │   ├── position.ts
│   │   ├── health.ts
│   │   ├── velocity.ts
│   │   ├── terrain.ts
│   │   └── index.ts
│   │
│   ├── systems/
│   │   ├── updatePhysics.ts
│   │   ├── updateDamage.ts
│   │   └── index.ts
│   │
│   ├── actions/
│   │   ├── sceneActions.ts
│   │   ├── combatActions.ts
│   │   └── index.ts
│   │
│   └── world.ts
│
├── features/
│   ├── enemies/
│   │   ├── EnemyRenderer.tsx
│   │   └── EnemyView.tsx
│   │
│   ├── terrain/
│   │   ├── TerrainRenderer.tsx
│   │   └── TerrainTile.tsx
│   │
│   └── player/
│       ├── PlayerRenderer.tsx
│       └── PlayerView.tsx
│
├── utils/
│
├── App.tsx
└── main.tsx
```

## Monorepo Structure

Use when core needs to run independently (workers, servers, CLI) or with multiple views:

```
my-app/
├── packages/
│   ├── core/
│   │   ├── src/
│   │   │   ├── traits/
│   │   │   ├── systems/
│   │   │   ├── actions/
│   │   │   └── world.ts
│   │   └── package.json    → @my-app/core
│   │
│   └── react/
│       ├── src/
│       │   ├── hooks/
│       │   └── index.ts
│       └── package.json    → @my-app/react
│
├── apps/
│   ├── editor/             → imports @my-app/core, @my-app/react
│   ├── cli/                → imports @my-app/core only
│   └── agent/              → imports @my-app/core only
│
└── pnpm-workspace.yaml
```
