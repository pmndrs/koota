import { defineConfig } from 'tsup';
import { inlineFunctionsPlugin } from 'babel-plugin-inline-functions';

export default defineConfig({
	entry: ['src/index.ts', 'src/react.ts'],
	format: ['esm', 'cjs'],
	dts: {
		resolve: true,
	},
	clean: true,
	esbuildPlugins: [inlineFunctionsPlugin()],
});
