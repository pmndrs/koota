# Labs

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

Outputs a colored diff table showing each benchmark's avg time, delta %, p-value, and classification (faster/slower/neutral). All three conditions must be met to flag a change: **Welch's t-test** (p ≤ 0.05), **Cohen's d** (|d| ≥ 1.0), and a **noise floor** (|delta| ≥ 5%). This combination eliminates false positives from CPU thermal/boost fluctuations between runs. Warns if hardware differs.

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

## Multi-run mode

On noisy hardware (turbo boost, thermal throttling, P/E-core scheduling), a single run may produce false positives in comparison. Multi-run mode executes the bench suite N times, **interleaved**, and merges all samples before saving. This captures between-run environmental variance in the sample arrays so the statistical tests self-calibrate.

```sh
pnpm bench --runs 3          # 3 rounds, then save
pnpm bench -c --runs 3       # 3 rounds, save, then compare vs baseline
```

Or set it permanently in config for a noisy machine:

```ts
export default defineConfig({
  benchDir: '.',
  runs: 3,
})
```

Interleaved means the execution order is `[file1, file2, ..., fileN, file1, file2, ..., fileN, ...]` so each bench file experiences different thermal states across rounds rather than running back-to-back under identical conditions.

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

| Option             | Default                                     | Description                                     |
| ------------------ | ------------------------------------------- | ----------------------------------------------- |
| `benchDir`         | (required)                                  | Directory to search, relative to config file    |
| `benchMatch`       | `**/*.bench.ts`                             | Glob pattern for discovery                      |
| `nodeFlags`        | `['--allow-natives-syntax', '--expose-gc']` | Node flags per worker process                   |
| `resultsDir`       | `.labs`                                     | Directory for saved results, relative to config |
| `runs`             | `1`                                         | Rounds per save (interleaved). Set to 3+ for noisy environments |
| `alpha`            | `0.05`                                      | Welch t-test significance level                 |
| `dThreshold`       | `1.0`                                       | Cohen's d effect size threshold                 |
| `noiseThreshold`   | `0.05`                                      | Minimum \|delta%\| to flag a change (noise floor) |
