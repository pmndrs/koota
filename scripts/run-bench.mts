import { spawnSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const benchDir = fileURLToPath(new URL('../benches/', import.meta.url));
const args: string[] = [];
let asserts = 'off';

for (let i = 2; i < process.argv.length; i++) {
  const arg = process.argv[i];
  if (arg === '--asserts' || arg.startsWith('--asserts=')) {
    const mode = arg === '--asserts' ? process.argv[++i] : arg.slice('--asserts='.length);
    if (mode !== 'on' && mode !== 'off') {
      console.error('Expected --asserts on or --asserts off.');
      process.exit(1);
    }
    asserts = mode;
  } else {
    args.push(arg);
  }
}

if (args.includes('--help') || args.includes('-h')) {
  console.log(`Usage: pnpm bench [--asserts on|off] [Labs arguments]

Assertions default to off. Benchmark runs compile Koota with the selected mode.

  pnpm bench --asserts off '@accessor' -n accessors-off
  pnpm bench --asserts on '@accessor' -n accessors-on
  pnpm bench baseline accessors-off
  pnpm bench compare accessors-on

Labs arguments and result commands are forwarded unchanged.`);
  process.exit(0);
}

function run(args: string[], env = process.env) {
  const result = spawnSync('pnpm', args, { cwd: benchDir, stdio: 'inherit', env });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

if (['baseline', 'compare', 'list', 'clear', 'delete', 'prune'].includes(args[0])) {
  run(['exec', 'labs', ...args]);
} else {
  const outDir = join(benchDir, '.labs', 'build', `asserts-${asserts}`);
  console.log(`Koota benchmarks: asserts ${asserts} (compiled)`);
  run([
    '--filter',
    'koota',
    'exec',
    'tsdown',
    '--define.__KOOTA_ASSERTS__',
    asserts === 'on' ? 'true' : 'false',
    '--out-dir',
    outDir,
    '--format',
    'esm',
    '--no-dts',
  ]);

  const tsconfig = join(outDir, 'tsconfig.json');
  await writeFile(
    tsconfig,
    JSON.stringify({
      extends: join(benchDir, 'tsconfig.json'),
      compilerOptions: {
        paths: {
          koota: [join(outDir, 'index.js')],
          'koota/react': [join(outDir, 'react.js')],
        },
      },
    })
  );
  run(['exec', 'labs', ...args], { ...process.env, TSX_TSCONFIG_PATH: tsconfig });
}
