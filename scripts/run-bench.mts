import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, symlinkSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoDir = fileURLToPath(new URL('../', import.meta.url));
const benchDir = join(repoDir, 'benches/');
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

Compare two checkouts interleaved in one session, which cancels clock drift. Each side names a
checkout directory, such as a worktree, and is compiled on its own before the run.

  git worktree add ../koota-base canary
  pnpm bench --against ../koota-base '@entity' -n entity

Labs arguments and result commands are forwarded unchanged.`);
  process.exit(0);
}

function run(args: string[], env = process.env) {
  const result = spawnSync('pnpm', args, { cwd: benchDir, stdio: 'inherit', env });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

/**
 * Compile koota from a checkout into that checkout's bench build directory. The tsconfig written
 * beside it maps koota to the bundle with relative paths, so a bench process started in any
 * checkout's bench directory loads the code of that checkout.
 */
async function compile(root: string) {
  const outDir = join(root, 'benches', '.labs', 'build', `asserts-${asserts}`);

  if (root !== repoDir) linkDependencies(root);

  const result = spawnSync(
    join(repoDir, 'packages', 'publish', 'node_modules', '.bin', 'tsdown'),
    [
      '--define.__KOOTA_ASSERTS__',
      asserts === 'on' ? 'true' : 'false',
      '--out-dir',
      outDir,
      '--format',
      'esm',
      '--no-dts',
    ],
    { cwd: join(root, 'packages', 'publish'), stdio: 'inherit' }
  );
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);

  await writeFile(
    join(outDir, 'tsconfig.json'),
    JSON.stringify({
      extends: '../../../tsconfig.json',
      compilerOptions: {
        baseUrl: '.',
        paths: {
          koota: ['./index.js'],
          'koota/react': ['./react.js'],
        },
      },
    })
  );
}

/**
 * Another checkout borrows this tree's dependencies, as labs does for the bench run itself. The
 * package directories are linked entry by entry, because a workspace link such as @koota/core
 * must resolve inside the other checkout, not back into this one.
 */
function linkDependencies(root: string) {
  for (const dir of ['', 'benches']) {
    const target = join(repoDir, dir, 'node_modules');
    const link = join(root, dir, 'node_modules');
    if (existsSync(target) && !existsSync(link)) symlinkSync(target, link, 'dir');
  }
  for (const dir of ['packages/publish', 'packages/core', 'packages/react', 'packages/collections']) {
    const target = join(repoDir, dir, 'node_modules');
    const link = join(root, dir, 'node_modules');
    if (!existsSync(target) || existsSync(link)) continue;
    mkdirSync(link);
    for (const entry of readdirSync(target)) {
      if (entry !== '@koota') {
        symlinkSync(join(target, entry), join(link, entry), 'dir');
        continue;
      }
      mkdirSync(join(link, entry));
      for (const name of readdirSync(join(target, entry))) {
        symlinkSync(join('..', '..', '..', name), join(link, entry, name), 'dir');
      }
    }
  }
}

/**
 * A side named by --against or --candidate must be a checkout directory, which is compiled here
 * and handed to labs as an absolute path. A git revision would be checked out by labs after this
 * script runs, and its bench processes would then resolve koota to this tree's source instead.
 */
async function compileSide(flag: string) {
  const i = args.indexOf(flag);
  if (i === -1) return;
  const spec = args[i + 1];
  const dir = spec === undefined ? undefined : resolve(process.cwd(), spec);
  if (dir === undefined || !existsSync(join(dir, 'packages', 'publish'))) {
    console.error(
      `${flag} needs a checkout directory of this repository. Create one with git worktree add ../koota-base <rev>.`
    );
    process.exit(1);
  }
  args[i + 1] = dir;
  console.log(`Koota benchmarks: compiling ${flag} ${dir}`);
  await compile(dir);
}

if (['baseline', 'compare', 'list', 'clear', 'delete', 'prune'].includes(args[0])) {
  run(['exec', 'labs', ...args]);
} else {
  console.log(`Koota benchmarks: asserts ${asserts} (compiled)`);
  // A candidate directory stands in for the working tree, which then has nothing to compile.
  if (!args.includes('--candidate')) await compile(repoDir);
  await compileSide('--against');
  await compileSide('--candidate');
  run(['exec', 'labs', ...args], {
    ...process.env,
    TSX_TSCONFIG_PATH: join('.labs', 'build', `asserts-${asserts}`, 'tsconfig.json'),
  });
}
