import { defineConfig } from 'labs';

export default defineConfig({
	testDir: '.',
	testMatch: '**/*.bench.ts',
	nodeFlags: ['--allow-natives-syntax', '--expose-gc'],
});
