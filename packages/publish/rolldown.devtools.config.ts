import { defineConfig } from 'rolldown';
import postcss from 'rollup-plugin-postcss';

const banner = '"use strict";';

export default defineConfig({
	input: { devtools: '../devtools/src/index.ts' },
	output: [
		{ format: 'esm', dir: 'dist', entryFileNames: '[name].js', banner },
		{ format: 'cjs', dir: 'dist', entryFileNames: '[name].cjs' },
	],
	external: ['react', 'react-dom', 'react/jsx-runtime', 'react-dom/client', 'koota', 'koota/react'],
	platform: 'browser',
	moduleTypes: {
		'.css': 'js',
		'.module.css': 'js',
	},
	plugins: [
		{
			name: 'rewrite-koota-imports',
			resolveId(source) {
				if (source === '@koota/core') {
					return { id: 'koota', external: true };
				}
				if (source === '@koota/react') {
					return { id: 'koota/react', external: true };
				}
			},
		},
		postcss({
			modules: {
				generateScopedName: '[name]__[local]___[hash:base64:5]',
				localsConvention: 'camelCaseOnly',
			},
			inject: true,
			extract: false,
			autoModules: true,
		}),
	],
});
