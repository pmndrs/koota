import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import alias from '@rollup/plugin-alias';
import commonjs from '@rollup/plugin-commonjs';
import { defineConfig } from 'rollup';
import esbuild from 'rollup-plugin-esbuild';
import postcss from 'rollup-plugin-postcss';

const require = createRequire(import.meta.url);
const preactDir = dirname(require.resolve('preact/package.json'));

export default defineConfig({
	input: { devtools: 'src/devtools.ts' },
	output: { format: 'es', dir: 'dist', entryFileNames: '[name].js' },
	external: [],
	plugins: [
		{
			name: 'rewrite-koota-imports',
			resolveId(source) {
				if (source === '@koota/core') {
					return { id: './index.js', external: true };
				}
			},
		},
		alias({
			entries: [
				{ find: 'react-dom/test-utils', replacement: join(preactDir, 'test-utils/dist/testUtils.module.js') },
				{ find: 'react-dom/client', replacement: join(preactDir, 'compat/client.mjs') },
				{ find: 'react-dom', replacement: join(preactDir, 'compat/dist/compat.module.js') },
				{ find: 'react/jsx-runtime', replacement: join(preactDir, 'jsx-runtime/dist/jsxRuntime.module.js') },
				{ find: 'react', replacement: join(preactDir, 'compat/dist/compat.module.js') },
			],
		}),
		postcss({
			modules: {
				generateScopedName: '[name]__[local]___[hash:base64:5]',
				localsConvention: 'camelCaseOnly',
			},
			inject: true,
			extract: false,
			autoModules: true,
		}),
		nodeResolve({
			extensions: ['.mjs', '.js', '.json', '.node', '.ts', '.tsx'],
			mainFields: ['module', 'main'],
		}),
		commonjs(),
		esbuild({
			target: 'es2020',
			tsconfig: 'tsconfig.json',
			jsx: 'automatic',
		}),
	],
});
