import { ParseResult } from '@babel/parser';
import {
	ArrowFunctionExpression,
	File,
	FunctionDeclaration,
	FunctionExpression,
	isIdentifier,
} from '@babel/types';
import _traverse from '@babel/traverse';
import { hasInlineDecorator } from './utils/inline-decorator-utils';
import { collectLocalDependencies } from './utils/collect-local-dependencies';
import { getFunctionParams } from './utils/get-function-params';

const traverse = (_traverse as unknown as { default: typeof _traverse }).default || _traverse;

export type InlinableFunction = {
	name: string;
	params: string[];
	func: FunctionDeclaration | ArrowFunctionExpression | FunctionExpression;
};

export const allFunctions = new Map<string, InlinableFunction>();
export const inlinableFunctions = new Map<string, InlinableFunction>();
export const inlinableFunctionCalls = new Map<string, InlinableFunction>();

export function collectInlinableFunctions(ast: ParseResult<File>) {
	// Collect all inlineable functions.
	// Look for any function that has a @inline decorator.
	traverse(ast, {
		// Collect function delcaratoins.
		FunctionDeclaration(path) {
			const node = path.node;
			const hasInline = hasInlineDecorator(node) || hasInlineDecorator(path.parent);

			// Ignore anonymous functions.
			if (!node.id) return;

			// If the function is not inlineable, save it in case there is a call to it.
			if (!hasInline) {
				allFunctions.set(node.id.name, {
					name: node.id.name,
					func: node,
					params: getFunctionParams(node),
				});
			} else {
				collectLocalDependencies(path);

				inlinableFunctions.set(node.id.name, {
					name: node.id.name,
					func: node,
					params: getFunctionParams(node),
				});
			}
		},
		// Collect arrow functions and function expressions (assigned to a variable).
		VariableDeclarator(path) {
			const node = path.node;
			const init = node.init;
			if (
				init &&
				(init.type === 'ArrowFunctionExpression' || init.type === 'FunctionExpression')
			) {
				const id = node.id;

				// Ignore anonymous functions.
				if (!isIdentifier(id)) return;

				// If the function is not inlineable, save it in case there is a call to it.
				if (!hasInlineDecorator(init)) {
					allFunctions.set(id.name, {
						name: id.name,
						func: init,
						params: getFunctionParams(init),
					});
				} else {
					collectLocalDependencies(path);

					inlinableFunctions.set(id.name, {
						name: id.name,
						func: init,
						params: getFunctionParams(init),
					});
				}
			}
		},
		CallExpression(path) {
			const node = path.node;
			const callee = node.callee;

			if (!isIdentifier(callee) || !hasInlineDecorator(node)) return;

			const name = callee.name;
			const func = allFunctions.get(name);
			if (func) inlinableFunctionCalls.set(name, func);
		},
	});
}

export function reset() {
	allFunctions.clear();
	inlinableFunctions.clear();
	inlinableFunctionCalls.clear();
}
