import { defineConfig } from 'labs';

export default defineConfig({
    benchDir: '.',
    benchMatch: '**/*.bench.ts',
    nodeFlags: ['--allow-natives-syntax', '--expose-gc'],
    runs: 3,
});
