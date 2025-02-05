import { ParseResult } from '@babel/parser';
import _traverse, { NodePath } from '@babel/traverse';
import {
	ArrowFunctionExpression,
	ExpressionStatement,
	File,
	FunctionDeclaration,
	FunctionExpression,
	isCallExpression,
	isIdentifier,
	VariableDeclarator,
} from '@babel/types';
import {
	collectDependencyChain,
	collectLocalDependencies,
	getFunctionLocalDeps,
} from './utils/collect-local-dependencies';
import { hasInlineDecorator, hasPureDecorator } from './utils/decorator-utils';
import { getFunctionParams } from './utils/get-function-params';

const traverse = (_traverse as unknown as { default: typeof _traverse }).default || _traverse;

export type InlinableFunction = {
	name: string;
	params: string[];
	func: FunctionDeclaration | ArrowFunctionExpression | FunctionExpression;
	path: NodePath<
		FunctionDeclaration | ArrowFunctionExpression | FunctionExpression | VariableDeclarator
	>;
};

export const allFunctions = new Map<string, InlinableFunction>();
export const inlinableFunctions = new Map<string, InlinableFunction>();
export const inlinableFunctionCalls = new Map<string, InlinableFunction>();
export const pureFunctions = new Set<string>();

export function collectMetadata(ast: ParseResult<File>) {
	// Look for any function that has a @inline or @pure decorator.
	traverse(ast, {
		// Collect function delcaratoins.
		FunctionDeclaration(path) {
			const node = path.node;
			const hasInline = hasInlineDecorator(node) || hasInlineDecorator(path.parent);
			const hasPure = hasPureDecorator(node) || hasPureDecorator(path.parent);

			// Ignore anonymous functions.
			if (!node.id) return;

			// If the function is not inlineable, save it in case there is a call to it.
			if (!hasInline) {
				allFunctions.set(node.id.name, {
					name: node.id.name,
					func: node,
					params: getFunctionParams(node),
					path,
				});
			} else {
				collectLocalDependencies(path);

				inlinableFunctions.set(node.id.name, {
					name: node.id.name,
					func: node,
					params: getFunctionParams(node),
					path,
				});
			}

			// Collect pure functions.
			if (hasPure) pureFunctions.add(node.id.name);
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
						path,
					});
				} else {
					collectLocalDependencies(path);

					inlinableFunctions.set(id.name, {
						name: id.name,
						func: init,
						params: getFunctionParams(init),
						path,
					});
				}

				// Collect pure functions.
				if (hasPureDecorator(init)) pureFunctions.add(id.name);
			}
		},
		CallExpression(path) {
			const node = path.node;
			const callee = node.callee;

			// Check if parent is an expression statement.
			if (path.parent.type === 'ExpressionStatement') {
				const parent = path.parent as unknown as ExpressionStatement;
				if (
					!isCallExpression(parent.expression) ||
					!isIdentifier(parent.expression.callee) ||
					!hasInlineDecorator(parent)
				)
					return;

				const name = parent.expression.callee.name;
				const func = allFunctions.get(name);
				if (func) inlinableFunctionCalls.set(name, func);
			} else {
				if (!isIdentifier(callee) || !hasInlineDecorator(node)) return;

				const name = callee.name;
				const func = allFunctions.get(name);
				if (func) inlinableFunctionCalls.set(name, func);
			}
		},
	});

	for (const func of inlinableFunctions.values()) {
		collectDependencyChain(func.name, func.path);
	}
}

export function resetMetadata() {
	allFunctions.clear();

	inlinableFunctions.clear();
	inlinableFunctionCalls.clear();
	pureFunctions.clear();
}
