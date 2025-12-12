import { createRequire } from 'node:module';
import { defineConfig } from 'rolldown';
import postcss from 'rollup-plugin-postcss';

const require = createRequire(import.meta.url);

export default defineConfig({
	input: { devtools: 'src/devtools.ts' },
	output: { format: 'esm', dir: 'dist', entryFileNames: '[name].js' },
	// Keep core external so the devtools shares the same instance as the host app
	external: [],
	platform: 'browser',
	resolve: {
		alias: {
			react: require.resolve('preact/compat'),
			'react-dom/test-utils': 'preact/test-utils',
			'react-dom/client': require.resolve('preact/compat/client'),
			'react-dom': require.resolve('preact/compat'),
			'react/jsx-runtime': require.resolve('preact/jsx-runtime'),
		},
	},
	moduleTypes: {
		'.css': 'js',
		'.module.css': 'js',
	},
	plugins: [
		{
			name: 'rewrite-koota-imports',
			resolveId(source) {
				// Rewrite internal workspace import to relative import
				if (source === '@koota/core') {
					return { id: './index.js', external: true };
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
