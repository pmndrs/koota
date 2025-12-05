import { defineConfig } from 'rolldown';

export default defineConfig({
	input: { 'devtools-plugin': 'src/devtools-plugin.ts' },
	output: { format: 'esm', dir: 'dist', entryFileNames: '[name].js' },
	external: ['unplugin'],
	platform: 'node',
});
