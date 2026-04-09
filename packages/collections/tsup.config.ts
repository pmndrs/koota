import { defineConfig } from 'tsup';
import inlineFunctions from 'unplugin-inline-functions/esbuild';

export default defineConfig({
    entry: ['src/index.ts'],
    format: ['esm', 'cjs'],
    dts: true,
    clean: true,
    esbuildPlugins: [inlineFunctions({ include: ['src/**/*.{js,ts,jsx,tsx}'] })],
});
