import { nodeResolve } from '@rollup/plugin-node-resolve';
import { defineConfig } from 'rollup';
import esbuild from 'rollup-plugin-esbuild';

export default defineConfig({
	input: {
		'devtools-vite': 'src/devtools-vite.ts',
		'devtools-rollup': 'src/devtools-rollup.ts',
		'devtools-rolldown': 'src/devtools-rolldown.ts',
		'devtools-webpack': 'src/devtools-webpack.ts',
		'devtools-esbuild': 'src/devtools-esbuild.ts',
	},
	output: { format: 'es', dir: 'dist', entryFileNames: '[name].js' },
	external: ['unplugin', 'acorn', 'estree-walker', 'magic-string'],
	plugins: [
		nodeResolve({
			extensions: ['.mjs', '.js', '.json', '.node', '.ts', '.tsx'],
		}),
		esbuild({
			target: 'es2020',
			tsconfig: 'tsconfig.json',
		}),
	],
});
