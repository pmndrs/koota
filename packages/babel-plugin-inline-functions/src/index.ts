import { parse } from '@babel/parser';
import * as esbuild from 'esbuild';
import fs from 'node:fs';
import { collectInlinableFunctions, inlinableFunctions } from './collect-inlinable-functions';
import { inlineFunctions } from './inline-functions';
import { createHash } from 'node:crypto';

const astCache = new Map<string, any>(); // hash -> ast

function hashContent(content: string): string {
	return createHash('md5').update(content).digest('hex');
}

export function inlineFunctionsPlugin(): esbuild.Plugin {
	return {
		name: 'inline-functions',
		setup(build) {
			let flag = true;

			build.onStart(async () => {
				if (!flag) return;

				flag = false;

				// Run the first pass to collect all inlinable functions.
				await build.esbuild.build({
					...build.initialOptions,
					write: false,
					plugins: [firstPass()],
				});
			});
			build.onLoad({ filter: /\.(js|ts)$/ }, async ({ path }) => {
				const contents = await fs.promises.readFile(path, 'utf8');
				const hash = hashContent(contents);

				let ast =
					astCache.get(hash) ??
					parse(contents, {
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

function firstPass(): esbuild.Plugin {
	return {
		name: 'inline-functions-first-pass',
		setup(build) {
			build.onStart(async () => {
				inlinableFunctions.clear();
				astCache.clear();
			});
			build.onLoad({ filter: /\.(js|ts)$/ }, async ({ path }) => {
				const contents = await fs.promises.readFile(path, 'utf8');
				const hash = hashContent(contents);

				let ast =
					astCache.get(hash) ??
					parse(contents, {
						sourceType: 'module',
						plugins: ['typescript'],
						sourceFilename: path,
					});

				astCache.set(hash, ast);
				collectInlinableFunctions(ast);

				return void 0;
			});
		},
	};
}
