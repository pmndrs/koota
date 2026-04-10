import { nodeResolve } from '@rollup/plugin-node-resolve';
import { defineConfig } from 'rollup';
import esbuild from 'rollup-plugin-esbuild';
import inlineFunctions from 'unplugin-inline-functions/rollup';

const input = {
	index: 'src/index.ts',
	react: 'src/react.ts',
};

const external = ['react', 'react-dom', 'react/jsx-runtime', 'react-dom/client'];

const plugins = [
	inlineFunctions({ include: ['src/index.ts', 'src/react.ts'] }),
	nodeResolve({
		extensions: ['.mjs', '.js', '.json', '.node', '.ts', '.tsx'],
	}),
	esbuild({
		target: 'es2020',
		tsconfig: 'tsconfig.json',
	}),
];

export default defineConfig([
	{
		input,
		external,
		plugins,
		output: {
			format: 'es',
			dir: 'dist',
			entryFileNames: '[name].js',
			chunkFileNames: '[name]-[hash].js',
			banner: '"use strict";',
		},
	},
	{
		input,
		external,
		plugins,
		output: {
			format: 'cjs',
			dir: 'dist',
			entryFileNames: '[name].cjs',
			chunkFileNames: '[name]-[hash].cjs',
		},
	},
]);
