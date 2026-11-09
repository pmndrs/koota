import { defineConfig } from 'tsdown';
import inlineFunctions from 'unplugin-inline-functions/rolldown';

export default defineConfig((options) => ({
  entry: ['src/index.ts', 'src/entity-methods.ts', 'src/react.ts'],
  tsconfig: '../tsconfig-publish.json',
  format: ['esm', 'cjs'],
  fixedExtension: false,
  // Force emitting "use strict" for all output
  // Not all bundlers and frameworks are capable of correctly transforming esm
  // to cjs output and koota requires strict mode to be enabled for the code to
  // be sound. The "use strict" directive has no ill effect when running in an
  // esm environment, while bringing the extra guarantee of ensuring strict mode
  // is used in non-conformant environments.
  // See https://262.ecma-international.org/5.1/#sec-C for more details.
  banner: () => ({ js: '"use strict";' }),
  // Keep all of core in one chunk. An entry that held core code of its own would make the chunk
  // export the constants that code reads, and an exported binding is never constant folded.
  outputOptions: {
    codeSplitting: {
      groups: [{ name: 'core', test: /packages[\\/](core|collections)[\\/]src[\\/].*(?<!\.d)\.ts$/ }],
    },
  },
  dts: { tsc: { eager: true }, entry: ['src/index.ts', 'src/entity-methods.ts', 'src/react.ts'] },
  plugins: [inlineFunctions({ include: ['src/**/*.{js,ts,jsx,tsx}'], define: options.define })],
}));
