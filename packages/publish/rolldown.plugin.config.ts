import { defineConfig } from 'rolldown';

export default defineConfig({
	input: {
		'devtools-vite': 'src/devtools-vite.ts',
		'devtools-rollup': 'src/devtools-rollup.ts',
		'devtools-rolldown': 'src/devtools-rolldown.ts',
		'devtools-webpack': 'src/devtools-webpack.ts',
		'devtools-esbuild': 'src/devtools-esbuild.ts',
	},
	output: { format: 'esm', dir: 'dist', entryFileNames: '[name].js' },
	external: ['unplugin'],
	platform: 'node',
});
