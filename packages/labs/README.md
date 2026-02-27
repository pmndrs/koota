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

## Writing a bench

```ts
import { bench, group } from 'labs';

group('my-group @mytag', () => {
  bench('my-bench', function* () {
    // setup
    yield () => {
      // measured code
    };
    // teardown
  }).gc('inner');
});
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
import { defineConfig } from 'labs';

export default defineConfig({
  testDir: '.',
  testMatch: '**/*.bench.ts',
  nodeFlags: ['--allow-natives-syntax', '--expose-gc'],
});
```


| Option      | Default                                     | Description                                  |
| ----------- | ------------------------------------------- | -------------------------------------------- |
| `testDir`   | (required)                                  | Directory to search, relative to config file |
| `testMatch` | `**/*.bench.ts`                             | Glob pattern for discovery                   |
| `nodeFlags` | `['--allow-natives-syntax', '--expose-gc']` | Node flags per worker process                |


