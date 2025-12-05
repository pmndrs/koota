import { defineConfig } from 'rolldown';

const banner = '"use strict";';

export default defineConfig({
	input: { 'devtools-plugin': 'src/devtools-plugin.ts' },
	output: [
		{ format: 'esm', dir: 'dist', entryFileNames: '[name].js', banner },
		{ format: 'cjs', dir: 'dist', entryFileNames: '[name].cjs' },
	],
	external: ['unplugin'],
	platform: 'node',
});
