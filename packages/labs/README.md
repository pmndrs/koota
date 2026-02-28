# Labs

Benchmark runner for koota. Discovers `*.bench.ts` files and runs each in an isolated process with V8 flags.

## Usage

```sh
pnpm bench                    # run all bench files
pnpm bench relation           # partial match on file name
pnpm bench "relation churn"   # separator-agnostic match
pnpm bench "@relation"        # filter by tag
pnpm bench "churn @relation"  # name + tag combined
pnpm bench --last             # rerun previous selection
```

## Saving Results

```sh
pnpm bench -s                                     # run all, save with auto timestamp
pnpm bench -s "v1.2.0"                            # run all, save with name (shorthand)
pnpm bench -s "v1.2.0" -m "after refactor"        # with description
pnpm bench --save-baseline "v1.2.0"               # save and immediately set as baseline
pnpm bench "@relation" -s "rel-run"               # filtered run + save
pnpm bench "@relation" --compare                  # run, save, then compare vs baseline
pnpm bench "@relation" -c                         # shorthand for --compare
```

Results are saved to `<benchDir>/.labs/results/<name>.json` and include hardware metadata (CPU, arch, runtime) for like-for-like comparisons.

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

Outputs a colored diff table showing each benchmark's avg time change and classification (faster/slower/neutral). Warns if hardware differs between runs.

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
| `compareThreshold` | `0.05`                                      | Delta threshold for compare (±5% = neutral)     |
