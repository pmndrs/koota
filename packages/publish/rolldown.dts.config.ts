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
		input: 'src/devtools-plugin.ts',
		output: { file: 'dist/devtools-plugin.d.ts', format: 'es' },
		plugins: [dts()],
	},
]);
