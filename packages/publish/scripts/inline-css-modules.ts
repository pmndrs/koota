import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import postcss from 'postcss';
import postcssModules from 'postcss-modules';
import type { Plugin } from 'rolldown';

const SUFFIX = '?koota-css-module';

/**
 * Bundles CSS modules into the JS output so the devtools ship as plain JS with
 * no stylesheet for consumers to wire up. Class names are scoped with
 * postcss-modules and exported as a camelCase map, and the compiled CSS is
 * appended to the document as a style tag when the module loads.
 *
 * tsdown and rolldown reserve .css ids for their own stylesheet pipelines, so
 * the resolved id carries a suffix that keeps those from seeing these files.
 */
export function inlineCssModules(): Plugin {
  return {
    name: 'koota:inline-css-modules',
    resolveId: {
      order: 'pre',
      filter: { id: /\.module\.css$/ },
      handler(source, importer) {
        if (!importer) return null;
        return { id: resolve(dirname(importer), source) + SUFFIX, moduleSideEffects: true };
      },
    },
    load: {
      order: 'pre',
      filter: { id: /\?koota-css-module$/ },
      async handler(id) {
        const file = id.slice(0, -SUFFIX.length);
        const source = await readFile(file, 'utf8');
        let classes: Record<string, string> = {};

        const result = await postcss([
          postcssModules({
            generateScopedName: '[name]__[local]___[hash:base64:5]',
            localsConvention: 'camelCaseOnly',
            getJSON: (_, json) => {
              classes = json;
            },
          }),
        ]).process(source, { from: file });

        const code = [
          `const css = ${JSON.stringify(result.css)};`,
          `if (typeof document !== 'undefined') {`,
          `  const style = document.createElement('style');`,
          `  style.textContent = css;`,
          `  document.head.appendChild(style);`,
          `}`,
          `export default ${JSON.stringify(classes)};`,
        ].join('\n');

        return { code, moduleType: 'js' };
      },
    },
  };
}
