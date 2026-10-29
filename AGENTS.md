<!-- managed:start -->

## Workspace Tools

- **Package Manager:** pnpm
- **Linter:** oxlint
- **Formatter:** prettier

### After Editing

✅ After editing files, check the types for errors and then format and lint only the files changed for the current task.

```sh
# Example
pnpm typecheck
# Run format and lint for only files modified
pnpm exec prettier --config .config/prettier/base.json --ignore-path .config/prettier/prettierignore --write src/App.tsx src/core/systems/move-entity.ts
pnpm exec oxlint src/App.tsx src/core/systems/move-entity.ts
```

❌ Avoid unless explicitly approved:

```sh
pnpm format
pnpm lint
```

<!-- managed:end -->

This monorepo uses `pnpm`.

**IMPORTANT:** Always use kebab-case for file names, even if it is not the usual convention.

The `skills/koota` directory contains a skill with reference documentation for the koota project. When updating the README, the skill should be updated as well to keep documentation in sync. Follow best practices for agent skills.

## Commit Messages

Follow the Gitmoji specification.

## Benchmarks

Benchmarks live in `benches/`. Benches should be run only for the relevant set using the tags or names and then compared to look for regressions or to optimize code.

```sh
# Run suites using tags or by name and name with -n
pnpm bench "@relation @graph" -n "Name"

# Set baseline
pnpm bench baseline "Name"

# Compare baseline to a test by name
pnpm bench compare "Name"
```

## Testing Principles

- Cover the common paths that represent the 80% of real usage. Add edge-case tests only when the edge case is important or guards against a meaningful regression.
- Test observable features and user stories, not implementation details. Test internals only when an exceptionally difficult case cannot be covered reliably through public behavior.

## Comments

Comments are documentation. Keep them concise and explain the algorithm or feature, not the change or its history. Use simple punctuation with no semicolons or em dashes.

# Const Policy

We want reduce top level const and inline anything that is an explicit hook we need tweak often. Always ask yourself if a const needs to exist before making it. Prefer to inline.

# Inlining and the V8 Budget

The publish build runs `unplugin-inline-functions`, which splices `@inline` functions into their callers and measures the result against V8's inlining limit. These rules keep the hot paths in the shape TurboFan can still optimize.

- A function TurboFan inlines must be at most 460 bytes of bytecode. Every byte of a callee, cold branches included, is also charged against a 920 byte pool per optimized caller, so a hot function with a large rare region costs the callers that inline it.
- Annotate `@inline` by hotness, not size. Helpers on the set, get, has, add, remove, spawn and destroy paths qualify. Registration and setup code does not, remove the flag there.
- Mark rare branches of hot functions `@cold`: relation pair dispatch, subscription loops, assertions that do more than throw. Throw only branches are outlined automatically. A cold branch may not write enclosing locals or `continue` out of a loop, restructure to if/else first.
- When a function is over budget for structural reasons, keep the hot body and move the rest into an exported helper. A check that is usually false stays inline, the work it guards goes out of line, see `emit`.
- `@pure` only on read only helpers whose unused call is safe to drop. Never on assertions.
- Cross module inlining needs every free binding of the callee exported and no default or rest parameters. The plugin refuses silently otherwise.
- Inline an entry function into the entity methods only if the callees under it stay small. If the method's tree exceeds the pool, make the next level a call again.
- Declare every field of a hot object in its literal so instances share one hidden class.
- Never lower the global budget. Fix the function the log names.
