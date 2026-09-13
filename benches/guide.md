# Benchmarks

| Location                                                                           | Scope                                                                       |
| ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `api/`                                                                             | Public entity, trait, relation, change, and query APIs                      |
| `integrations/`                                                                    | React hook workloads                                                        |
| `scenarios/`                                                                       | N-body, relation churn, and scene graph propagation                         |
| [`packages/core/src/kernel/benches`](../packages/core/src/kernel/benches/guide.md) | Kernel operations, Iris comparisons, experiments, and archived measurements |

Run public and scenario benchmarks from the repository root with `pnpm bench`. Kernel benchmarks have their own package runner:

```sh
pnpm bench '@scene' -n scene-comparison
pnpm --filter @koota/core bench '@kernel-direct-storage' -n kernel-access
```

Choose only the relevant tags or bench filename. Register every implementation being compared in the **same `.bench.ts` file**, with matching fixtures and timing boundaries, so Labs can interleave the cases. The scene graph file includes all three relation storage strategies together.

Use separate fresh-process measurements for retained heap. Historical benchmark artifacts and source patches live in the kernel benchmark archive. See the [kernel benchmark guide](../packages/core/src/kernel/benches/guide.md) for variant loading, Iris setup, source replay, and measurement limits.
