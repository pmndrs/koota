import { defineConfig } from 'rollup';
import dts from 'rollup-plugin-dts';

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
			paths: {
				'@koota/core': './index',
			},
		},
		external: ['@koota/core', 'react', 'react-dom', 'react/jsx-runtime', 'react-dom/client'],
		plugins: [dts({ respectExternal: true })],
	},
]);
