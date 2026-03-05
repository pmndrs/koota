# Labs

> [!WARNING]
> Labs currently only supports Node.js. Workers are spawned via `tsx` with V8-specific flags (`--allow-natives-syntax`, `--expose-gc`), which are not portable to Bun (JSC) or Deno. Portability will be on the roadmap.

Benchmark runner for koota. Discovers `*.bench.ts` files and runs each in an isolated process with V8 flags.

## Usage

Every run saves results by default (auto-timestamped). Use `bench run` to execute without saving.

```sh
pnpm bench                              # run all, save with auto timestamp
pnpm bench "relation"                   # partial match on file name, save
pnpm bench "relation churn"             # separator-agnostic match, save
pnpm bench "@relation"                  # filter by tag, save
pnpm bench "churn @relation"            # name + tag combined, save
pnpm bench -n "v1.2.0"                 # save with explicit name
pnpm bench -n "v1.2.0" -m "refactor"   # save with name and description
pnpm bench --baseline                   # save and set as baseline
pnpm bench -b                           # shorthand for --baseline
pnpm bench -n "v1.2.0" -b              # save with name and set as baseline
pnpm bench --compare                    # save, then compare vs baseline
pnpm bench -c                           # shorthand for --compare
pnpm bench --last                       # rerun previous selection, save
```

Results are saved to `<benchDir>/.labs/results/<name>.json` and include hardware metadata (CPU, arch, runtime) for like-for-like comparisons.

## Running without saving

```sh
pnpm bench run                          # run all, no save
pnpm bench run "relation"              # filtered, no save
pnpm bench run "@relation"             # filtered by tag, no save
pnpm bench run --last                  # replay last selection, no save
```

## Managing Results

```sh
pnpm bench list                        # list all saved results
pnpm bench delete "v1.2.0"             # delete a specific saved result
pnpm bench prune                       # remove results with unstable CPU clocks
pnpm bench clear                       # delete all saved results
```

`bench list` shows each result's name, description, timestamp, and CPU. The current baseline is marked with `(baseline)`.

## Baseline

```sh
pnpm bench baseline                    # interactive baseline picker
pnpm bench baseline "v1.2.0"          # set a result as the baseline
pnpm bench --baseline                 # save and set the new result as baseline
pnpm bench -b                         # shorthand for --baseline
```

## Comparing

```sh
pnpm bench compare                     # interactive picker (latest preselected)
pnpm bench compare "v1.3.0"           # compare named result vs baseline
pnpm bench compare --last             # replay the last compared pair
pnpm bench compare -l                 # shorthand for --last
```

Outputs a colored table for each eligible benchmark:

| Column | Description |
|---|---|
| baseline | Baseline p50 (median) time |
| candidate | Candidate p50 (median) time |
| Δp50 | Signed percent change in p50 — color-coded green (faster), red (slower), or dim (neutral) |
| Δp99 | Signed percent change in p99 — when this diverges from Δp50, the distribution shape changed |
| p | Mann-Whitney U p-value — below `alpha` = statistically significant |

Each row is prefixed with a verdict icon: green `▲` (faster), red `▼` (slower), or gray `■` (neutral). Below each row, two distribution sparklines sit under their respective columns — baseline (cyan) and candidate (magenta) — on a shared axis. This makes distribution shifts, bimodal behavior, and tail changes visible at a glance.

Comparison is gated. Two runs must pass all checks before any results are shown.

**Environment checks** (fail = entire comparison is denied):

- **Hardware match** — CPU model, architecture, and runtime (Node/Bun/etc.) must be identical between runs.
- **Clock stability** — each run's CPU frequency must be stable throughout (pre/post drift < 5%), and the two runs must have run at comparable clock speeds (< 5% apart). Unstable clocks produce unreliable timings regardless of sample count.

**Per-bench checks** (fail = that bench is skipped with a reason):

- **Not missing** — the bench must exist in both runs. Benches present only in baseline or only in candidate are reported separately.
- **Not noisy** — neither run's samples can be flagged `noisy` (adaptive sampling hit `maxCpuTime` before converging). Noisy data is not reliable enough to compare.
- **Minimum samples** — both runs must have ≥ 14 samples after outlier trimming. The MW-U normal approximation is unreliable below this threshold.

## Writing a bench

```ts
import { bench, group } from 'labs'

group('my-group @mytag', () => {
  bench('my-bench', function* () {
    // setup
    yield () => {
      // measured code
    }
    // teardown
  }).gc('inner')
})
```

## Tags

Tags are `@`-prefixed tokens in the `group` or `bench` name string. They are stripped from the display name and used for filtering.

```ts
group('relation-queries @relation', () => {
  bench('ChildOf(parent)', function* () { ... }).gc('inner');
  bench('wildcard @slow', function* () { ... }).gc('inner');
});
```

Tags inherit: `ChildOf(parent)` has effective tags `[@relation]`, `wildcard` has `[@relation, @slow]`.

Filter by tag (quote the `@` so pnpm passes it through):

```sh
pnpm bench "@relation"    # runs both benches
pnpm bench "@slow"        # runs only wildcard
```

## Statistical comparison strategy

Labs is single-run only. Each benchmark comparison uses mitata's collected sample arrays for the baseline and candidate.

A change is flagged only when all three conditions are met:

1. **`p <= alpha`** (Mann-Whitney U, default 0.05) — statistical significance. The Mann-Whitney U test is a non-parametric, rank-based test that determines whether values from one group consistently rank higher than the other. It is robust to non-normal distributions and GC-induced outliers.
2. **`|Δp50| >= minDelta`** (default 5%) — practical magnitude. Filters environmental noise (thermal throttling, OS scheduling, etc.) that can produce statistically significant but practically meaningless differences, especially on hybrid-core CPUs.
3. **`|cliff's d| >= minEffect`** (default 0.474) — effect size. [Cliff's delta](https://en.wikipedia.org/wiki/Effect_size#Cliff's_delta) measures how separated two distributions are (range [-1, +1]). High-variance benchmarks can show large median shifts while the actual sample distributions overlap heavily — a sign of JIT/scheduling noise rather than a real code change. The default threshold of 0.474 corresponds to the "medium" effect size boundary (Romano et al. 2006), meaning at least ~74% of pairwise sample comparisons must favor one direction.

The p99 ratio provides a variance/stability signal. When it diverges from the p50 ratio, the distribution shape changed between runs (e.g., tails got worse even if the median improved).

## Config

Place `labs.config.ts` alongside your bench files:

```ts
import { defineConfig } from 'labs'

export default defineConfig({
  benchDir: '.',
  benchMatch: '**/*.bench.ts',
  nodeFlags: ['--allow-natives-syntax', '--expose-gc'],
})
```

| Option           | Default                                     | Description                                                                                                        |
| ---------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `benchDir`       | (required)                                  | Directory to search, relative to config file                                                                       |
| `benchMatch`     | `**/*.bench.ts`                             | Glob pattern for discovery                                                                                         |
| `nodeFlags`      | `['--allow-natives-syntax', '--expose-gc']` | Node flags per worker process                                                                                      |
| `resultsDir`     | `.labs`                                     | Directory for saved results, relative to config                                                                    |
| `adaptive`       | `true`                                      | Adaptive sampling mode: `true` uses default CI threshold, `false` disables, number sets CI threshold (e.g. `0.01`) |
| `maxCpuTime`     | `5`                                         | Max CPU budget in seconds for adaptive sampling; benches that don't converge or reach `minSamples` are `noisy`    |
| `minCpuTime`     | `0.642`                                     | Minimum CPU time budget per benchmark in seconds; set to raise/lower runtime budget                                |
| `minSamples`     | `20`                                        | Minimum sample count per benchmark; set to increase/decrease sample floor                                          |
| `maxSamples`     | `1e9`                                       | Maximum sample cap per benchmark to prevent pathological long runs                                                 |
| `alpha`          | `0.05`                                      | Mann-Whitney U significance level                                                                                  |
| `minDelta`       | `0.05`                                      | Minimum absolute Δp50 ratio to flag a verdict; filters environmental noise on identical code                       |
| `minEffect`      | `0.474`                                     | Minimum \|Cliff's d\| to flag a verdict; filters noise on high-variance benches where distributions overlap        |

Sampling behavior:

- `adaptive: false`: fixed stopping (`samples >= minSamples` and `cpu_time >= minCpuTime`) with `maxSamples` as cap.
- `adaptive: true`: adaptive CI stopping with default threshold (`2.5%`), but never before `minSamples` and `minCpuTime`.
- `adaptive: <number>`: same adaptive behavior with a custom CI threshold (`0.01` is stricter than `0.025`).
- In adaptive mode, `maxCpuTime` is a hard budget. Benchmarks that don't converge or don't reach `minSamples` are marked `noisy`.

> [!NOTE]
> **More info: adaptive statistics**
>
> Labs uses online variance in log-space (Welford update) to handle long-tailed VM timing samples. This means convergence is based on multiplicative error (relative confidence), which is usually more stable for benchmark timing data than linear-space variance.
>
> Stopping in adaptive mode is:
>
> - Floor: wait until both `minSamples` and `minCpuTime` are reached
> - Converged: stop once the relative CI target is met (`adaptive: true` => `2.5%`, `adaptive: 0.01` => `1%`)
> - Bailout: if convergence or `minSamples` is not reached before `maxCpuTime`, mark as `noisy`
> - Safety cap: `maxSamples` still limits pathological runs
