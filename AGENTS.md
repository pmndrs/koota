**IMPORTANT:** Always use kebab-case for file names, even if it is not the usual convention.

The `skills/koota` directory contains a skill with reference documentation for the koota project. When updating the README, the skill should be updated as well to keep documentation in sync. Follow best practices for agent skills.

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
pnpm exec prettier --config .config/prettier.json --ignore-path .config/prettierignore --write src/App.tsx src/core/systems/move-entity.ts
pnpm lint -- src/App.tsx src/core/systems/move-entity.ts
```

❌ Avoid unless explicitly approved:

```sh
pnpm format
pnpm lint
```

<!-- managed:end -->
