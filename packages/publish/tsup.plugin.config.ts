import { defineConfig } from 'tsup';

export default defineConfig({
	entry: ['src/devtools-plugin.ts'],
	format: ['esm', 'cjs'],
	sourcemap: true,
	// Bundle all plugin dependencies
	noExternal: ['unplugin', 'acorn', 'estree-walker', 'magic-string'],
	dts: { compilerOptions: { allowImportingTsExtensions: true } },
	clean: false, // Don't delete previous output
	esbuildOptions: (options, { format }) => {
		options.banner = format === 'esm' ? { js: '"use strict";' } : undefined;
	},
});
