import { parse } from '@babel/parser';
import chalk from 'chalk';
import * as esbuild from 'esbuild';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { collectMetadata, resetMetadata } from './collect-metadata';
import { inlineFunctions } from './inline-functions';
import { STATS } from './stats';

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
				const counts = Array.from(STATS.getAllInlinedFunctionCounts()).filter(
					([name]) => name.trim() !== ''
				);
				if (counts.length > 0) {
					console.log(chalk.green('\n✓ Inlined functions:'));
					for (const [name, count] of counts) {
						console.log(`  ${chalk.cyan(name)}: ${chalk.bold(count)}`);
					}
				}

				const functions = Array.from(STATS.getAllTransformedFunctions()).filter(
					([name]) => name.trim() !== ''
				);

				if (functions.length > 0) {
					console.log(chalk.green('\n✓ Transformed functions:'));
					// Group functions into lines of 4.
					const chunkSize = 4;
					// Calculate max width for each column.
					const columnWidths = Array(chunkSize).fill(0);
					for (let i = 0; i < functions.length; i++) {
						const col = i % chunkSize;
						const [name, { isPure }] = functions[i];
						// Account for 2 extra characters if the function is pure (space + star)
						columnWidths[col] = Math.max(
							columnWidths[col],
							name.length + (isPure ? 2 : 0)
						);
					}
					// Print in grid format.
					for (let i = 0; i < functions.length; i += chunkSize) {
						const chunk = functions.slice(i, i + chunkSize);
						const paddedChunk = chunk.map(([name, { isPure }], idx) =>
							(isPure ? chalk.yellow : chalk.cyan)(
								`${name}${isPure ? ' ★' : ''}`.padEnd(columnWidths[idx])
							)
						);
						console.log(`  ${paddedChunk.join('  ')}`);
					}
					console.log('');
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
				STATS.reset();
				resetMetadata();
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
				collectMetadata(ast);

				return void 0;
			});
		},
	};
}
