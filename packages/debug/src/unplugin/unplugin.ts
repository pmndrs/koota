import { createUnplugin } from 'unplugin';
import { Parser } from 'acorn';
import { walk } from 'estree-walker';
import MagicString from 'magic-string';
import type { Node, CallExpression, VariableDeclarator, Identifier } from 'estree';

const TRAIT_FUNCTIONS = ['trait', 'relation'];

export interface DebugPluginOptions {
	include?: RegExp | ((id: string) => boolean);
	exclude?: RegExp | ((id: string) => boolean);
}

function shouldTransform(id: string, options: DebugPluginOptions): boolean {
	if (options.exclude) {
		if (typeof options.exclude === 'function') {
			if (options.exclude(id)) return false;
		} else if (options.exclude.test(id)) {
			return false;
		}
	}

	if (options.include) {
		if (typeof options.include === 'function') {
			return options.include(id);
		}
		return options.include.test(id);
	}

	return /\.[jt]sx?$/.test(id);
}

export const unplugin = createUnplugin((options: DebugPluginOptions = {}) => ({
	name: 'koota-debug',

	transformInclude(id) {
		return shouldTransform(id, options);
	},

	transform(code, id) {
		let ast: Node;

		try {
			ast = Parser.parse(code, {
				sourceType: 'module',
				ecmaVersion: 'latest',
				locations: true,
			}) as unknown as Node;
		} catch {
			// If parsing fails (e.g., JSX), skip this file
			return null;
		}

		const s = new MagicString(code);
		const insertions: Array<{ pos: number; content: string }> = [];

		walk(ast, {
			enter(node) {
				if (node.type !== 'VariableDeclaration') return;

				for (const declarator of (node as any).declarations as VariableDeclarator[]) {
					if (
						declarator.id.type !== 'Identifier' ||
						!declarator.init ||
						declarator.init.type !== 'CallExpression'
					) {
						continue;
					}

					const call = declarator.init as CallExpression;
					const callee = call.callee;

					// Check if it's a direct call to trait/relation
					if (callee.type !== 'Identifier') continue;
					if (!TRAIT_FUNCTIONS.includes(callee.name)) continue;

					const varName = (declarator.id as Identifier).name;
					const loc = call.loc!;

					const debugCode = `\n${varName}.debugName = ${JSON.stringify(
						varName
					)};\n${varName}.debugSource = { file: ${JSON.stringify(id)}, line: ${
						loc.start.line
					}, column: ${loc.start.column} };`;

					// Find the end of the statement
					const statementEnd = (node as any).end as number;
					insertions.push({ pos: statementEnd, content: debugCode });
				}
			},
		});

		if (insertions.length === 0) return null;

		// Apply insertions in reverse order to preserve positions
		insertions.sort((a, b) => b.pos - a.pos);
		for (const { pos, content } of insertions) {
			s.appendRight(pos, content);
		}

		return {
			code: s.toString(),
			map: s.generateMap({ hires: true }),
		};
	},
}));

export const vitePlugin = unplugin.vite;
export const rollupPlugin = unplugin.rollup;
export const webpackPlugin = unplugin.webpack;
export const esbuildPlugin = unplugin.esbuild;
