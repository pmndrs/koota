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
pnpm bench clear                       # delete all saved results
```

`bench list` shows each result's name, description, timestamp, and CPU. The current baseline is marked with `(baseline)`.

## Baseline

```sh
pnpm bench baseline                    # print the current baseline name
pnpm bench baseline "v1.2.0"          # set a result as the baseline
pnpm bench --save-baseline "v1.2.0"   # save and immediately set as baseline
```

## Comparing

```sh
pnpm bench compare                     # compare most recent result vs baseline
pnpm bench compare "v1.3.0"           # compare named result vs baseline
```

Outputs a colored diff table showing each benchmark's median time and ±MAD, delta %, and verdict (faster/slower/neutral).

Comparison is gated. Two runs must pass all checks before any results are shown.

**Environment checks** (fail = entire comparison is denied):

- **Hardware match** — CPU model, architecture, and runtime (Node/Bun/etc.) must be identical between runs.
- **Clock stability** — each run's CPU frequency must be stable throughout (pre/post drift < 5%), and the two runs must have run at comparable clock speeds (< 5% apart). Unstable clocks produce unreliable timings regardless of sample count.

**Per-bench checks** (fail = that bench is skipped with a reason):

- **Not missing** — the bench must exist in both runs. Benches present only in baseline or only in candidate are reported separately.
- **Not noisy** — neither run's samples can be flagged `noisy` (i.e. adaptive sampling hit `maxCpuTime` before converging). Unconverged samples are not reliable enough to compare.
- **Minimum samples** — both runs must have ≥ 20 samples. The Mann-Whitney U normal approximation is inaccurate below this threshold.

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

A change is flagged only when both conditions are met:

1. **Statistical significance** — Mann-Whitney U `p <= alpha` (default 0.05). Tests whether values from one group consistently rank higher than the other. Robust to non-normal distributions and GC-induced outliers.
2. **Effect size** — `|d| >= dThreshold` (Cliff's delta, default 0.147). Measures how often candidate values beat baseline values across all pairs. Guards against large-N sensitivity where any tiny shift becomes statistically significant.

The spread column shows ±MAD (median absolute deviation). It turns yellow when the effect size is below threshold, indicating a weak signal.

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
| `maxCpuTime`     | `5`                                         | Max CPU budget in seconds for adaptive sampling; benches that do not converge are flagged `noisy`                  |
| `minCpuTime`     | `0.642`                                     | Minimum CPU time budget per benchmark in seconds; set to raise/lower runtime budget                                |
| `minSamples`     | `12`                                        | Minimum sample count per benchmark; set to increase/decrease sample floor                                          |
| `maxSamples`     | `1e9`                                       | Maximum sample cap per benchmark to prevent pathological long runs                                                 |
| `alpha`          | `0.05`                                      | Mann-Whitney U significance level                                                                                  |
| `dThreshold`     | `0.147`                                     | Cliff's delta effect size threshold                                                                                |

Sampling behavior:

- `adaptive: false`: fixed stopping (`samples >= minSamples` and `cpu_time >= minCpuTime`) with `maxSamples` as cap.
- `adaptive: true`: adaptive CI stopping with default threshold (`2.5%`), but never before `minSamples` and `minCpuTime`.
- `adaptive: <number>`: same adaptive behavior with a custom CI threshold (`0.01` is stricter than `0.025`).
- In adaptive mode, `maxCpuTime` is a hard budget. If reached before CI convergence, the benchmark is marked `noisy`.

> [!NOTE]
> **More info: adaptive statistics**
>
> Labs uses online variance in log-space (Welford update) to handle long-tailed VM timing samples. This means convergence is based on multiplicative error (relative confidence), which is usually more stable for benchmark timing data than linear-space variance.
>
> Stopping in adaptive mode is:
>
> - Floor: wait until both `minSamples` and `minCpuTime` are reached
> - Converged: stop once the relative CI target is met (`adaptive: true` => `2.5%`, `adaptive: 0.01` => `1%`)
> - Bailout: if convergence is not reached before `maxCpuTime`, mark the benchmark as `noisy`
> - Safety cap: `maxSamples` still limits pathological runs
