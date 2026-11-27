import { existsSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { extname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

registerHooks({
  resolve(specifier, context, nextResolve) {
    const build = process.env.KOOTA_BENCH_BUILD;
    if (
      build &&
      (specifier === 'koota' || specifier === 'koota/isolated' || specifier === 'koota/react')
    ) {
      const entry = specifier === 'koota' ? 'index' : specifier.slice('koota/'.length);
      return nextResolve(pathToFileURL(resolve(build, `${entry}.js`)).href, context);
    }

    // Benchmarks in comparison checkouts can import TypeScript helpers without an extension.
    if (context.parentURL?.endsWith('.ts') && specifier.startsWith('.') && !extname(specifier)) {
      const file = new URL(`${specifier}.ts`, context.parentURL);
      if (existsSync(file)) return nextResolve(file.href, context);
    }
    return nextResolve(specifier, context);
  },
});
