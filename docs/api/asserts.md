# Assertions

Koota makes common ECS assumptions executable when assertions are enabled:

- **Entity lifetime:** `add`, `remove`, `set`, `changed`, `destroy`, `get`, `has`, `targetFor`, and `targetsFor` require a live entity. Stale handles cannot access a recycled entity.
- **Trait membership:** `set` and `changed` require the trait to be present. A setter callback must leave its entity and trait valid before automatic writeback.
- **Relation validity:** adding or setting a pair requires a concrete, live target in the same world. Setting requires the pair to exist. Wildcards and query filters remain valid for queries, membership checks, and removal.
- **Relation consistency:** adding an edge requires base trait membership. Clearing that membership requires no remaining targets. Removing a forward edge requires its reverse source entry to exist.

Errors include a stable code such as `[ENTITY_ALIVE]`, `[TRAIT_PRESENT]`, or `[RELATION_PRESENT]`, plus the relevant entity, target, or trait identifiers. The thrown `Error` supplies the call stack. Applications can attach that information to a bug report with their build revision and replay.

Assertions check preconditions and writeback boundaries. They do not roll back callback side effects or mutations made through shared object references. Checks required for normal behavior, such as skipping an entity destroyed inside an `updateEach` callback, remain enabled in every build.

Missing-trait `get` returns `undefined`, duplicate adds and absent-trait removals remain valid, and `isAlive()` and `world.has(entity)` remain safe lifetime probes. `Removed` query selections intentionally expose historical data and do not require current trait membership. Entity subscriptions on dead handles retain their existing no-op behavior.

Broad `Or` queries can match entities without every data trait. Use `select` to choose data shared by all results, or iterate entities and use `entity.get` for optional traits.

Query accessors `readEach` and `updateEach` leave snapshot validity and selected trait membership to the caller. They do not assert entity lifetime or trait membership before access or writeback. Update callbacks must preserve the selected traits they write back. Discard query results after resetting or destroying their world.

Raw writes through `getStore` or `getPages` bypass these checks. Their callers must maintain storage and membership invariants. Application rules such as finite coordinates or health bounds belong in the simulation's systems because Koota accepts arbitrary trait values. Replay recording is also an application concern.

Entity generations survive world resets and page reuse. Generations are eight bits, so an individual slot wraps after 256 lifetimes. Assertions cannot distinguish an ancient handle from an identical packed handle after that wrap.

By default, assertions are enabled unless `process.env.NODE_ENV` is `'production'`. Bundlers normally replace this expression. Direct browser imports without a build step keep assertions enabled.

The published package preserves `__KOOTA_ASSERTS__` so the application's build can choose whether to retain the checks. For example, in Vite:

```ts
import { defineConfig } from 'vite'

export default defineConfig(({ command }) => ({
  define: {
    __KOOTA_ASSERTS__: command === 'serve',
  },
}))
```

Use `true` to keep assertions in a production build. Use `false` to remove assertions and their conditions through dead code elimination. Explicitly defining the flag is needed to remove the code completely, because a bundler cannot assume that an undefined optional global will stay undefined at runtime.

With assertions disabled, the caller must satisfy these preconditions. Invalid operations may read or write a recycled entity, write absent traits, or leave inconsistent relations.

## Benchmark assertion modes

`pnpm bench` compiles Koota with assertions off by default. Select a mode explicitly
to measure assertion overhead:

```sh
pnpm bench --asserts off '@accessor' -n accessors-off
pnpm bench --asserts on '@accessor' -n accessors-on
pnpm bench baseline accessors-off
pnpm bench compare accessors-on
```

Both modes use the package build configuration, including function inlining. The
off build defines `__KOOTA_ASSERTS__` as `false` so dead code elimination removes
the checks. The on build defines it as `true`, regardless of `NODE_ENV`.

Each benchmark run rebuilds the selected mode from the current source. Generated
builds live in `.labs/build/asserts-on` and `.labs/build/asserts-off`. Both `koota`
and `koota/react` imports resolve to that build.

Labs tags, names, and result commands are forwarded unchanged. Result commands
such as `baseline`, `compare`, and `list` do not build Koota. Include the mode in
saved result names when comparing modes. Labs' own benchmark result assertions
remain enabled in both modes.

Use regular API tags such as `@entity`, `@trait`, `@relation`, and `@accessor`.
Both assertion modes exercise the same workloads.

Run `pnpm bench --help` for examples.
