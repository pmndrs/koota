import { defineConfig } from 'tsup';

export default defineConfig({
	entry: ['src/index.ts', 'src/react.ts'],
	format: ['esm', 'cjs'],
	esbuildOptions: (options, { format }) => {
		options.banner = format === 'esm' ? {
			js: '\"use strict\";',
		} : undefined;
	},
	dts: {
		resolve: true,
	},
	clean: true,
});
