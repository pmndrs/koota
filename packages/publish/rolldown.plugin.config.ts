import { defineConfig } from 'rolldown';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const banner = '"use strict";';

export default defineConfig({
	input: { 'devtools-plugin': 'src/devtools-plugin.ts' },
	output: [
		{ format: 'esm', dir: 'dist', entryFileNames: '[name].js', banner },
		{ format: 'cjs', dir: 'dist', entryFileNames: '[name].cjs' },
	],
	external: ['unplugin'],
	platform: 'node',
	resolve: {
		alias: {
			'@koota/devtools/plugin': path.resolve(__dirname, '../devtools/plugin/index.ts'),
		},
	},
});
