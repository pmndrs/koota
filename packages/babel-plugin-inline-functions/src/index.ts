import { parse } from '@babel/parser';
import * as esbuild from 'esbuild';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { collectInlinableFunctions, reset } from './collect-inlinable-functions';
import { inlineFunctions } from './inline-functions';
import { getAllInlinedFunctionCounts, getAllTransformedFunctions } from './stats';
import chalk from 'chalk';

const astCache = new Map<string, any>(); // hash -> ast
const codeCache = new Map<string, string>(); // hash -> transformed code

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

				// The plugin can rerun for different formats (ESM, CJS, etc.)
				// We can return the cached code if it exists since our transforms are indepndent.
				if (codeCache.has(hash)) {
					return {
						contents: codeCache.get(hash),
						loader: path.endsWith('.ts') ? 'ts' : 'js',
					};
				}

				let ast =
					astCache.get(hash) ??
					parse(contents, {
						sourceType: 'module',
						plugins: ['typescript'],
						sourceFilename: path,
					});

				const code = inlineFunctions(ast);
				codeCache.set(hash, code);

				return {
					contents: code,
					loader: path.endsWith('.ts') ? 'ts' : 'js',
				};
			});

			build.onEnd(() => {
				const counts = Array.from(getAllInlinedFunctionCounts()).filter(
					([name]) => name.trim() !== ''
				);
				if (counts.length > 0) {
					console.log(chalk.green('\n✓ Inlined functions:'));
					for (const [name, count] of counts) {
						console.log(`  ${chalk.cyan(name)}: ${chalk.bold(count)}`);
					}
				}

				const functions = Array.from(getAllTransformedFunctions()).filter(
					(name) => name.trim() !== ''
				);

				if (functions.length > 0) {
					console.log(chalk.green('\n✓ Transformed functions:'));
					// Group functions into lines of 4
					const chunkSize = 4;
					// Calculate max width for each column
					const columnWidths = Array(chunkSize).fill(0);
					for (let i = 0; i < functions.length; i++) {
						const col = i % chunkSize;
						columnWidths[col] = Math.max(columnWidths[col], functions[i].length);
					}
					// Print in grid format
					for (let i = 0; i < functions.length; i += chunkSize) {
						const chunk = functions.slice(i, i + chunkSize);
						const paddedChunk = chunk.map((name, idx) =>
							chalk.cyan(name.padEnd(columnWidths[idx]))
						);
						console.log(`  ${paddedChunk.join('  ')}`);
					}
				}
			});
		},
	};
}

function firstPass(): esbuild.Plugin {
	return {
		name: 'inline-functions-first-pass',
		setup(build) {
			build.onStart(async () => {
				reset();
				astCache.clear();
				codeCache.clear();
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
