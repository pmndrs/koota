import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'tsdown';
import { inlineCssModules } from './inline-css-modules.ts';

const require = createRequire(import.meta.url);
const currentDir = dirname(fileURLToPath(import.meta.url));
const ROOT = join(currentDir, '..');
const OUT_DIR = join(ROOT, 'dist');
const CORE_SPECIFIER = '@koota/core';

/**
 * The standalone devtools entry ships its own renderer so it can mount without
 * React in the host app. React and react-dom are aliased to preact/compat and
 * bundled in, while core stays external so the devtools share one world
 * instance with the host.
 */
async function bundleDevtools() {
  console.log('\n> Bundling standalone devtools...');

  await build({
    config: false,
    cwd: ROOT,
    entry: { devtools: 'src/devtools.ts' },
    tsconfig: join(ROOT, '../tsconfig-publish.json'),
    outDir: OUT_DIR,
    format: ['esm', 'cjs'],
    fixedExtension: false,
    clean: false,
    platform: 'browser',
    alias: {
      'react/jsx-runtime': require.resolve('preact/jsx-runtime'),
      'react-dom/client': require.resolve('preact/compat/client'),
      'react-dom/test-utils': require.resolve('preact/test-utils'),
      'react-dom': require.resolve('preact/compat'),
      react: require.resolve('preact/compat'),
    },
    deps: { alwaysBundle: [/^react(-dom)?(\/|$)/, /^preact(\/|$)/], neverBundle: [CORE_SPECIFIER] },
    dts: { eager: true },
    report: false,
    plugins: [inlineCssModules()],
  });
}

/**
 * @koota/core is a workspace package that is never published on its own, so the
 * bundle has to point at the published core entry of the matching format.
 */
async function rewriteCoreImports() {
  console.log('\n> Rewriting @koota/core imports...');

  const files: Array<[string, string]> = [
    ['devtools.js', './index.js'],
    ['devtools.d.ts', './index.js'],
    ['devtools.cjs', './index.cjs'],
    ['devtools.d.cts', './index.cjs'],
  ];

  await Promise.all(
    files.map(async ([name, target]) => {
      const file = join(OUT_DIR, name);
      const source = await readFile(file, 'utf8');
      await writeFile(
        file,
        source
          .replaceAll(`'${CORE_SPECIFIER}'`, `'${target}'`)
          .replaceAll(`"${CORE_SPECIFIER}"`, `"${target}"`)
      );
    })
  );
}

/**
 * The alias and rewrite above fail silently, so check the emitted specifiers
 * rather than trusting the transforms.
 */
async function verifyOutput() {
  console.log('\n> Verifying emitted specifiers...');

  const problems: string[] = [];

  for (const name of ['devtools.js', 'devtools.cjs', 'devtools.d.ts', 'devtools.d.cts']) {
    const source = await readFile(join(OUT_DIR, name), 'utf8');

    for (const [, specifier] of source.matchAll(/(?:from|require\()\s*['"]([^'"]+)['"]/g)) {
      if (specifier.startsWith('@koota/')) {
        problems.push(`${name}: '${specifier}' is a workspace package that is never published`);
      } else if (/^(react|react-dom|preact)(\/|$)/.test(specifier)) {
        problems.push(`${name}: '${specifier}' should have been bundled with preact`);
      }
    }
  }

  if (problems.length > 0) {
    console.error(`\n> Invalid devtools output:\n${problems.map((p) => `  - ${p}`).join('\n')}`);
    process.exit(1);
  }
}

await bundleDevtools();
await rewriteCoreImports();
await verifyOutput();
console.log('✓ Standalone devtools bundled successfully\n');
