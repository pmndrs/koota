import { defineConfig } from '@pmndrs/labs';

export default defineConfig({
  benchDir: '.',
  benchMatch: '**/*.bench.ts',
  nodeFlags: [
    '--allow-natives-syntax',
    '--expose-gc',
    '--import',
    new URL('../scripts/resolve-bench-imports.mts', import.meta.url).href,
  ],
});
