import { defineConfig } from 'rollup';
import dts from 'rollup-plugin-dts';

const kootaExternal = ['@koota/core', 'react', 'react-dom', 'react/jsx-runtime', 'react-dom/client'];
const pluginExternal = ['unplugin', 'acorn', 'estree-walker', 'magic-string'];

export default defineConfig([
	{
		input: 'src/index.ts',
		output: { file: 'dist/index.d.ts', format: 'es' },
		plugins: [dts({ respectExternal: true })],
	},
	{
		input: 'src/react.ts',
		output: {
			file: 'dist/react.d.ts',
			format: 'es',
			paths: { '@koota/core': './index' },
		},
		external: kootaExternal,
		plugins: [dts({ respectExternal: true })],
	},
	{
		input: 'src/devtools.ts',
		output: {
			file: 'dist/devtools.d.ts',
			format: 'es',
			paths: { '@koota/core': './index' },
		},
		external: kootaExternal,
		plugins: [dts({ respectExternal: true })],
	},
	{
		input: 'src/devtools-react.ts',
		output: {
			file: 'dist/devtools-react.d.ts',
			format: 'es',
			paths: { '@koota/core': './index' },
		},
		external: [...kootaExternal, 'koota', 'koota/devtools'],
		plugins: [dts({ respectExternal: true })],
	},
	{
		input: 'src/devtools-vite.ts',
		output: { file: 'dist/devtools-vite.d.ts', format: 'es' },
		external: pluginExternal,
		plugins: [dts({ respectExternal: true })],
	},
	{
		input: 'src/devtools-rollup.ts',
		output: { file: 'dist/devtools-rollup.d.ts', format: 'es' },
		external: pluginExternal,
		plugins: [dts({ respectExternal: true })],
	},
	{
		input: 'src/devtools-rolldown.ts',
		output: { file: 'dist/devtools-rolldown.d.ts', format: 'es' },
		external: pluginExternal,
		plugins: [dts({ respectExternal: true })],
	},
	{
		input: 'src/devtools-webpack.ts',
		output: { file: 'dist/devtools-webpack.d.ts', format: 'es' },
		external: pluginExternal,
		plugins: [dts({ respectExternal: true })],
	},
	{
		input: 'src/devtools-esbuild.ts',
		output: { file: 'dist/devtools-esbuild.d.ts', format: 'es' },
		external: pluginExternal,
		plugins: [dts({ respectExternal: true })],
	},
]);
