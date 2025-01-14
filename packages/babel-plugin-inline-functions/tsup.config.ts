import { defineConfig } from 'tsup';

export default defineConfig({
	entry: ['src/index.ts'],
	format: ['esm', 'cjs'],
	external: [
		'node:fs',
		'tty',
		'util',
		'os',
		'@babel/generator',
		'@babel/parser',
		'@babel/traverse',
		'@babel/types',
	],
	dts: true,
	clean: true,
});
