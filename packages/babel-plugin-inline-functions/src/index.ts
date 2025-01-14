import { parse } from '@babel/parser';

import * as esbuild from 'esbuild';
import fs from 'node:fs';
import { inlineFunctions, reset } from './inline-functions';

export function inlineFunctionsPlugin(): esbuild.Plugin {
	return {
		name: 'inline-functions',
		setup(build) {
			build.onStart(() => reset());
			build.onLoad({ filter: /\.(js|ts)$/ }, async ({ path }) => {
				const contents = await fs.promises.readFile(path, 'utf8');
				const ast = parse(contents, {
					sourceType: 'module',
					plugins: ['typescript'],
					sourceFilename: path,
				});
				const code = inlineFunctions(ast);

				return {
					contents: code,
					loader: path.endsWith('.ts') ? 'ts' : 'js',
				};
			});
		},
	};
}
