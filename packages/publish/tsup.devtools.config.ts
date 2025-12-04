import { defineConfig } from 'tsup';

export default defineConfig({
	entry: ['src/devtools.ts'],
	format: ['esm', 'cjs'],
	sourcemap: true,
	// Bundle EVERYTHING - no externals for self-contained devtools
	noExternal: [/.*/],
	loader: {
		'.css': 'css',
		'.module.css': 'local-css',
	},
	dts: true, // Don't resolve, just emit types
	clean: false, // Don't delete core/react output
	esbuildOptions: (options, { format }) => {
		options.banner = format === 'esm' ? { js: '"use strict";' } : undefined;
	},
});
