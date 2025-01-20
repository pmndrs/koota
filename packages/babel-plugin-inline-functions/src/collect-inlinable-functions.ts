import { ParseResult } from '@babel/parser';
import {
	ArrowFunctionExpression,
	File,
	FunctionDeclaration,
	FunctionExpression,
	isIdentifier,
} from '@babel/types';
import _traverse from '@babel/traverse';
import { hasInlineDecorator } from './utils/has-inline-decorator';
import { collectLocalDependencies } from './utils/collect-local-dependencies';
import { getFunctionParams } from './utils/get-function-params';

const traverse = (_traverse as unknown as { default: typeof _traverse }).default || _traverse;

type InlinableFunction = {
	name: string;
	params: string[];
	func: FunctionDeclaration | ArrowFunctionExpression | FunctionExpression;
};

export const inlinableFunctions = new Map<string, InlinableFunction>();

export function collectInlinableFunctions(ast: ParseResult<File>) {
	// Collect all inlineable functions.
	// Look for any function that has a @inline decorator.
	traverse(ast, {
		// Collect function delcaratoins.
		FunctionDeclaration(path) {
			const node = path.node;
			const hasInline = hasInlineDecorator(node) || hasInlineDecorator(path.parent);
			if (!hasInline || !node.id) return;

			collectLocalDependencies(path);

			inlinableFunctions.set(node.id.name, {
				name: node.id.name,
				func: node,
				params: getFunctionParams(node),
			});
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
				if (!hasInlineDecorator(init) || !isIdentifier(id)) return;

				collectLocalDependencies(path);

				inlinableFunctions.set(id.name, {
					name: id.name,
					func: init,
					params: getFunctionParams(init),
				});
			}
		},
	});
}
