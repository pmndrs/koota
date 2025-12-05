import { defineConfig } from 'rolldown';
import inlineFunctions from 'unplugin-inline-functions/rolldown';
import postcss from 'rollup-plugin-postcss';

export default defineConfig({
	input: { index: 'src/index.ts', react: 'src/react.ts', devtools: 'src/devtools.ts' },
	output: { format: 'esm', dir: 'dist', entryFileNames: '[name].js' },
	external: ['react', 'react-dom', 'react/jsx-runtime', 'react-dom/client'],
	platform: 'browser',
	moduleTypes: {
		'.css': 'js',
		'.module.css': 'js',
	},
	plugins: [
		postcss({
			modules: {
				generateScopedName: '[name]__[local]___[hash:base64:5]',
				localsConvention: 'camelCaseOnly',
			},
			inject: true,
			extract: false,
			autoModules: true,
		}),
		inlineFunctions({
			include: ['src/index.ts', 'src/react.ts'],
		}),
	],
});
