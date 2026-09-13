# Kernel and API benchmarks

Labs benches for the archetype kernel in [`../`](../) and the public API in
[`../../api`](../../api). Kernel tests live in [`../tests`](../tests).

| File               | What it measures                                                       |
| ------------------ | ---------------------------------------------------------------------- |
| `kernel.bench.ts`  | Kernel presence, scalar access, snapshots, transitions, cold population |
| `api.bench.ts`     | Public entity methods, `updateEach`, `getPages`, tag toggles, spawning |
| `sparse.bench.ts`  | Kernel sparse against archetype traits: churn, observed queries, data access, mixed collects |

Run from the repository root and select a tag or file name:

```sh
pnpm --filter @koota/core bench '@kernel-access' -n kernel-access
pnpm --filter @koota/core bench '@api-structure' -n api-structure
```

Tags: `@kernel-access`, `@kernel-structure`, `@kernel-sparse`, `@api-access`,
`@api-structure`.

Every case builds its own world inside the generator and destroys it after the
assertion, so cases do not share entity pages. Report eight fresh-process blocks
for comparisons; short runs verify execution only. The design and the numbers
behind it are in [`../../../docs/ecs-design.md`](../../../docs/ecs-design.md).
