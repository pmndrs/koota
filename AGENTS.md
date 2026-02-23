This monorepo uses `pnpm`.

**IMPORTANT:** Always use kebab-case for file names, even if it is not the usual convention.

The `skills/koota` directory contains a skill with reference documentation for the koota project. When updating the README, the skill should be updated as well to keep documentation in sync. Follow best practices for agent skills.

## Benchmarks

Benchmarks live in `benches/`. Each benchmark is a directory with a `src/main.ts` entry point.

```sh
# Interactive GUI selector
pnpm bench

# Run a specific suite by name (partial match works)
pnpm bench <name>

# Replay last selection without prompting
pnpm bench --last
```
