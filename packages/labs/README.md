# Labs

Benchmark runner for koota. Discovers `*.bench.ts` files and runs each in an isolated process with V8 flags.

## Usage

```sh
pnpm bench                    # run all bench files
pnpm bench change-detection   # filter by name (partial match)
pnpm bench relation           # matches relation-churn + relation-performance
pnpm bench --last             # rerun previous selection
```

## Writing a bench

```ts
import { bench, group } from 'labs'

group('my-group', () => {
  bench('my-bench', function* () {
    // setup
    yield () => {
      // measured code
    }
    // teardown
  }).gc('inner')
})
```

No `await run()` needed — the runner handles execution.

## Config

Place `labs.config.ts` alongside your bench files:

```ts
import { defineConfig } from 'labs'

export default defineConfig({
  testDir: '.',
  testMatch: '**/*.bench.ts',
  nodeFlags: ['--allow-natives-syntax', '--expose-gc'],
})
```

| Option      | Default                                     | Description                                  |
| ----------- | ------------------------------------------- | -------------------------------------------- |
| `testDir`   | (required)                                  | Directory to search, relative to config file |
| `testMatch` | `**/*.bench.ts`                             | Glob pattern for discovery                   |
| `nodeFlags` | `['--allow-natives-syntax', '--expose-gc']` | Node flags per worker process                |
