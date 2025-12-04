import { defineConfig } from 'tsup';

export default defineConfig({
	entry: ['src/devtools.ts'],
	format: ['esm', 'cjs'],
	sourcemap: true,
	// Koota is in the bundle!
	external: ['@koota/core', '@koota/react'],
	// Bundle React and everything else
	noExternal: ['react', 'react-dom', '@tanstack/react-virtual', 'react-force-graph-2d'],
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
