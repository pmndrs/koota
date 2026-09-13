import { defineConfig } from '@pmndrs/labs';

export default defineConfig({
  benchDir: 'src/kernel/benches',
  benchMatch: '**/*.bench.ts',
});
