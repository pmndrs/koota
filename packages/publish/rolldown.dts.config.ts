import { defineConfig } from 'rollup';
import dts from 'rollup-plugin-dts';

const dtsConfig = {
	compilerOptions: {
		paths: {
			'@koota/core': ['../core/src'],
			'@koota/react': ['../react/src'],
			'@koota/devtools': ['../devtools/src'],
		},
	},
};

export default defineConfig([
	{
		input: 'src/index.ts',
		output: { file: 'dist/index.d.ts', format: 'es' },
		plugins: [dts(dtsConfig)],
	},
	{
		input: 'src/react.ts',
		output: { file: 'dist/react.d.ts', format: 'es' },
		plugins: [dts(dtsConfig)],
	},
	{
		input: '../devtools/src/index.ts',
		output: { file: 'dist/devtools.d.ts', format: 'es' },
		plugins: [dts(dtsConfig)],
	},
	{
		input: '../devtools/plugin/index.ts',
		output: { file: 'dist/devtools-plugin.d.ts', format: 'es' },
		plugins: [dts(dtsConfig)],
	},
]);
