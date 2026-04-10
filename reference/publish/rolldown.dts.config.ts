import { defineConfig } from 'rolldown';
import dts from 'rollup-plugin-dts';

export default defineConfig([
	{
		input: 'src/index.ts',
		output: { file: 'dist/index.d.ts', format: 'es' },
		plugins: [dts()],
	},
	{
		input: 'src/react.ts',
		output: {
			file: 'dist/react.d.ts',
			format: 'es',
			paths: {
				'@koota/core': './index',
			},
		},
		external: ['@koota/core'],
		plugins: [dts()],
	},
	{
		input: 'src/devtools.ts',
		output: {
			file: 'dist/devtools.d.ts',
			format: 'es',
			paths: {
				'@koota/core': './index',
			},
		},
		external: ['@koota/core'],
		plugins: [dts()],
	},
	{
		input: 'src/devtools-react.ts',
		output: {
			file: 'dist/devtools-react.d.ts',
			format: 'es',
			paths: {
				'@koota/core': './index',
			},
		},
		external: ['@koota/core', 'react'],
		plugins: [dts()],
	},
	{
		input: 'src/devtools-vite.ts',
		output: { file: 'dist/devtools-vite.d.ts', format: 'es' },
		plugins: [dts()],
	},
	{
		input: 'src/devtools-rollup.ts',
		output: { file: 'dist/devtools-rollup.d.ts', format: 'es' },
		plugins: [dts()],
	},
	{
		input: 'src/devtools-rolldown.ts',
		output: { file: 'dist/devtools-rolldown.d.ts', format: 'es' },
		plugins: [dts()],
	},
	{
		input: 'src/devtools-webpack.ts',
		output: { file: 'dist/devtools-webpack.d.ts', format: 'es' },
		plugins: [dts()],
	},
	{
		input: 'src/devtools-esbuild.ts',
		output: { file: 'dist/devtools-esbuild.d.ts', format: 'es' },
		plugins: [dts()],
	},
]);
