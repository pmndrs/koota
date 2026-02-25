This monorepo uses `pnpm`.

**IMPORTANT:** Always use kebab-case for file names, even if it is not the usual convention.

The `skills/koota` directory contains a skill with reference documentation for the koota project. When updating the README, the skill should be updated as well to keep documentation in sync. Follow best practices for agent skills.

## Benchmarks

Benchmarks live in `benches/`. Each benchmark is a directory with a `src/main.ts` entry point.

```sh
# Interactive GUI selector
pnpm bench

# Run one or more suites by name (partial match works)
pnpm bench <name> [name2 ...]

# Comma-separated names also work
pnpm bench <name1,name2,...>

# Replay last selection without prompting
pnpm bench --last
```
