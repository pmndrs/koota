import { defineConfig } from 'tsdown';
import inlineFunctions from 'unplugin-inline-functions/rolldown';

export default defineConfig({
  entry: ['src/index.ts', 'src/react.ts'],
  tsconfig: '../tsconfig-publish.json',
  format: ['esm', 'cjs'],
  fixedExtension: false,
  // Force emitting "use strict" for ESM output
  // Not all bundlers and frameworks are capable of correctly transforming esm
  // to cjs output and koota requires strict mode to be enabled for the code to
  // be sound. The "use strict" directive has no ill effect when running in an
  // esm environment, while bringing the extra guarantee of ensuring strict mode
  // is used in non-conformant environments.
  // See https://262.ecma-international.org/5.1/#sec-C for more details.
  banner: ({ format }) => (format === 'esm' ? { js: '"use strict";' } : undefined),
  dts: { eager: true, entry: ['src/index.ts', 'src/react.ts'] },
  plugins: [inlineFunctions({ include: ['src/**/*.{js,ts,jsx,tsx}'] })],
});
