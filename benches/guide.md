# Benchmarks

| Location        | Scope                                                     |
| --------------- | --------------------------------------------------------- |
| `api/`          | Entity, trait, relation, change, and query API benchmarks |
| `integrations/` | React hook workloads                                      |
| `scenarios/`    | N-body, relation churn, and scene graph propagation       |

Benchmarks use the public `koota` and `koota/react` APIs. Do not import package internals or source files from `packages/`. Query hashing is exercised through `createQuery` and `world.query` in `api/query-performance/query-api.bench.ts`.

Run benchmarks from the repository root. Select only the relevant tags or benchmark filename:

```sh
pnpm bench 'query-api' -n query-api
pnpm bench '@scene' -n scene-propagation
```

The Labs config discovers `**/*.bench.ts` recursively, so new suites belong in the matching category without additional configuration. Keep scenario fixtures and systems beside their benchmark files.

Save a run as a baseline and compare subsequent runs by name:

```sh
pnpm bench baseline query-api
pnpm bench 'query-api' -n query-api-check
pnpm bench compare query-api-check
```
