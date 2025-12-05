import { defineConfig } from 'rolldown';
import inlineFunctions from 'unplugin-inline-functions/rolldown';

const banner = '"use strict";';

export default defineConfig({
	input: { index: 'src/index.ts', react: 'src/react.ts' },
	output: [
		{ format: 'esm', dir: 'dist', entryFileNames: '[name].js', banner },
		{ format: 'cjs', dir: 'dist', entryFileNames: '[name].cjs' },
	],
	external: ['react', 'react-dom', 'react/jsx-runtime', 'react-dom/client', 'postcss', 'vite'],
	plugins: [
		inlineFunctions({
			include: ['src/**/*.ts', '../core/src/**/*.ts', '../react/src/**/*.ts'],
		}),
	],
});
