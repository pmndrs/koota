import { spawnSync } from 'node:child_process';
import { access, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'tsdown';

const require = createRequire(import.meta.url);
const currentDir = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(currentDir, '../dist/svelte');
const CORE_SPECIFIER = '@koota/core';
const TSC_PATH = join(dirname(require.resolve('typescript/package.json')), 'bin/tsc');

/**
 * The Svelte bindings ship as unbundled modules that keep their `.svelte.js`
 * suffix, so the consumer's Svelte compiler is the one that expands the runes
 * inside them. Bundling or precompiling here would pin the output to a single
 * generate mode and break SSR. tsc only strips the types and emits declarations;
 * the declarations are rolled into a single public entry afterward.
 */
async function compileBindings() {
  console.log('\n> Compiling Svelte bindings...');

  // tsc does not clean its outDir. The full build gets this for free because
  // tsdown wipes dist first, but this script is also run on its own.
  await rm(OUT_DIR, { recursive: true, force: true });

  const result = spawnSync(
    process.execPath,
    [TSC_PATH, '-p', join(currentDir, '../tsconfig.svelte.json')],
    { cwd: join(currentDir, '..'), stdio: 'inherit' }
  );

  if (result.status !== 0) {
    console.error('\n> Error compiling Svelte bindings');
    process.exit(result.status ?? 1);
  }
}

async function collectFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map((entry) => {
      const path = join(dir, entry.name);
      return entry.isDirectory() ? collectFiles(path) : [path];
    })
  );
  return files.flat();
}

async function bundleDeclarations() {
  console.log('\n> Bundling Svelte declarations...');

  const entry = join(OUT_DIR, 'index.d.ts');
  await build({
    config: false,
    tsconfig: false,
    cwd: join(currentDir, '..'),
    entry: [entry],
    outDir: OUT_DIR,
    format: ['esm'],
    clean: false,
    deps: { neverBundle: [CORE_SPECIFIER] },
    dts: { dtsInput: true, emitDtsOnly: true, generator: 'oxc' },
    report: false,
  });

  const declarations = (await collectFiles(OUT_DIR)).filter(
    (file) => file.endsWith('.d.ts') && file !== entry
  );
  await Promise.all(declarations.map((file) => rm(file)));

  const source = await readFile(entry, 'utf8');
  await writeFile(entry, source.replace(/^\/\/#(?:end)?region.*\n/gm, ''));
}

/**
 * Both transforms above fail silently: the rewrite is a string replacement that
 * simply matches nothing, and the declaration bundling deletes every .d.ts it
 * did not itself produce. Either way the build stays green and the bad
 * specifier only surfaces when a consumer tries to resolve it. Check what was
 * actually emitted rather than trusting the transforms.
 */
async function verifyOutput() {
  console.log('\n> Verifying emitted specifiers...');

  const files = (await collectFiles(OUT_DIR)).filter((file) => /\.(js|d\.ts)$/.test(file));
  const problems: string[] = [];

  for (const file of files) {
    const source = await readFile(file, 'utf8');
    const name = relative(OUT_DIR, file);

    for (const [, specifier] of source.matchAll(/from ['"]([^'"]+)['"]/g)) {
      if (specifier.startsWith('@koota/')) {
        problems.push(`${name}: '${specifier}' is a workspace package that is never published`);
        continue;
      }

      if (!specifier.startsWith('.')) continue;

      // These files ship unbundled, so Node resolves the specifiers verbatim
      // and needs a full extension on every relative import.
      if (!specifier.endsWith('.js')) {
        problems.push(`${name}: relative import '${specifier}' is missing its .js extension`);
        continue;
      }

      try {
        await access(join(dirname(file), specifier));
      } catch {
        problems.push(`${name}: '${specifier}' does not exist`);
      }
    }
  }

  if (problems.length > 0) {
    console.error(`\n> Invalid Svelte output:\n${problems.map((p) => `  - ${p}`).join('\n')}`);
    process.exit(1);
  }
}

/**
 * @koota/core is a workspace package that is never published on its own, so the
 * bindings have to point at the bundled entry instead. A relative path also
 * guarantees every entry shares one core instance, which a bare specifier only
 * does if the consumer's resolver dedupes the package correctly.
 */
async function rewriteCoreImports() {
  console.log('\n> Rewriting @koota/core imports...');

  const files = (await collectFiles(OUT_DIR)).filter((file) => /\.(js|d\.ts)$/.test(file));

  await Promise.all(
    files.map(async (file) => {
      const source = await readFile(file, 'utf8');
      if (!source.includes(CORE_SPECIFIER)) return;

      // TypeScript maps index.js to the public ESM declaration, so runtime
      // and type imports share the same published core entry.
      const target = relative(dirname(file), join(OUT_DIR, '../index.js')).replaceAll('\\', '/');
      await writeFile(
        file,
        source
          .replaceAll(`'${CORE_SPECIFIER}'`, `'${target}'`)
          .replaceAll(`"${CORE_SPECIFIER}"`, `"${target}"`)
      );
    })
  );
}

await compileBindings();
await bundleDeclarations();
await rewriteCoreImports();
await verifyOutput();
console.log('✓ Svelte bindings compiled successfully\n');
