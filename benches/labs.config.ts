import { defineConfig } from 'labs';

export default defineConfig({
    benchDir: '.',
    benchMatch: '**/*.bench.ts',
    maxCpuTime: 10,
});
