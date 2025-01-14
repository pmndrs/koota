import _generate from '@babel/generator';
import { ParseResult } from '@babel/parser';
import _traverse from '@babel/traverse';
import {
	ArrowFunctionExpression,
	assignmentExpression,
	booleanLiteral,
	cloneNode,
	conditionalExpression,
	Expression,
	expressionStatement,
	File,
	FunctionDeclaration,
	FunctionExpression,
	identifier,
	isIdentifier,
	isStatement,
	logicalExpression,
	Node,
	numericLiteral,
	ReturnStatement,
	sequenceExpression,
	Statement,
	unaryExpression,
	variableDeclaration,
	variableDeclarator,
} from '@babel/types';
import { addImportsForDependencies } from './utils/add-import-for-dependencies';
import { collectLocalDependencies } from './utils/collect-local-dependencies';
import { getFunctionBody } from './utils/get-function-content';
import { getFunctionParams } from './utils/get-function-params';
import { hasInlineDecorator } from './utils/has-inline-decorator';
import { removeImportForFunction } from './utils/remove-import-for-function';

// Depending on the version of babel, the default export may be different.
const generate = (_generate as unknown as { default: typeof _generate }).default || _generate;
const traverse = (_traverse as unknown as { default: typeof _traverse }).default || _traverse;

type InlinableFunction = {
	name: string;
	params: string[];
	func: FunctionDeclaration | ArrowFunctionExpression | FunctionExpression;
};

const inlinableFunctions = new Map<string, InlinableFunction>();

export function reset() {
	inlinableFunctions.clear();
}

export function inlineFunctions(ast: ParseResult<File>) {
	let uniqueCounter = 0;

	// First pass: Collect all inlineable functions.
	// Look for any function that has a @inline decorator.
	traverse(ast, {
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

	// Second pass: Inline all invocations of the inlinable functions.
	traverse(ast, {
		CallExpression(path) {
			const callee = path.node.callee;

			// Only support named function calls -- ie not methods or accessors.
			if (!isIdentifier(callee) || !inlinableFunctions.has(callee.name)) return;

			const inlinableFn = inlinableFunctions.get(callee.name)!;

			// Create a mapping of parameter names to their argument expressions.
			const paramMappings = new Map<string, Expression>();
			inlinableFn.params.forEach((param, index) => {
				const expression = path.node.arguments[index];
				paramMappings.set(param, expression as Expression);
			});

			// Transform imports.
			removeImportForFunction(path, inlinableFn.name);
			addImportsForDependencies(path, inlinableFn.name);

			// const { body, returnStatement } = getFunctionContent(inlinableFn.func);
			const body = getFunctionBody(inlinableFn.func);
			const variableNames = new Map<string, string>();
			const uniqueSuffix = `_${uniqueCounter++}`;

			// Count return statements
			let returnCount = 0;
			let lastReturnStatement: ReturnStatement;

			for (const statement of body) {
				if (statement.type === 'ReturnStatement') {
					returnCount++;
					lastReturnStatement = statement;
				}

				traverse(
					statement,
					{
						ReturnStatement(path) {
							returnCount++;
							lastReturnStatement = path.node;
						},
					},
					path.scope
				);
			}

			const hasSingleReturn = returnCount === 1;

			if (hasSingleReturn && lastReturnStatement!) {
				// For functions with a single return, we can inline directly
				const inlinedBody: Statement[] = [];
				let returnExpression: Expression =
					lastReturnStatement.argument || identifier('undefined');

				for (const statement of body) {
					const inlinedStatement = cloneNode(statement);

					traverse(
						inlinedStatement,
						{
							VariableDeclarator(varPath) {
								if (isIdentifier(varPath.node.id)) {
									const oldName = varPath.node.id.name;
									const newName = `${oldName}${uniqueSuffix}`;
									variableNames.set(oldName, newName);
									varPath.node.id.name = newName;
								}
							},
							Identifier(idPath) {
								// Replace parameters and renamed variables
								if (paramMappings.has(idPath.node.name)) {
									idPath.replaceWith(paramMappings.get(idPath.node.name)!);
								} else if (variableNames.has(idPath.node.name)) {
									idPath.node.name = variableNames.get(idPath.node.name)!;
								}
							},
						},
						path.scope
					);

					if (
						inlinedStatement.type !== 'EmptyStatement' &&
						inlinedStatement.type !== 'ReturnStatement'
					) {
						inlinedBody.push(inlinedStatement);
					}
				}

				// Clone and transform the return expression
				returnExpression = cloneNode(returnExpression);
				traverse(
					returnExpression as Node,
					{
						Identifier(idPath) {
							if (paramMappings.has(idPath.node.name)) {
								idPath.replaceWith(paramMappings.get(idPath.node.name)!);
							} else if (variableNames.has(idPath.node.name)) {
								idPath.node.name = variableNames.get(idPath.node.name)!;
							}
						},
					},
					path.scope
				);

				// Replace the call with the return expression
				path.replaceWith(returnExpression);

				// Insert our transformed code before the original call
				const statementPath = path.getStatementParent();
				if (statementPath) statementPath.insertBefore(inlinedBody);

				return;
			}

			const resultName = `result_${callee.name}_${uniqueSuffix}`;
			const completedName = `completed_${callee.name}_${uniqueSuffix}`;
			let hasReturn = false;

			const inlinedBody: Statement[] = [];

			for (const statement of body) {
				const inlinedStatement = cloneNode(statement);

				// Check if the statement itself is a return statement
				if (inlinedStatement.type === 'ReturnStatement') {
					hasReturn = true;
					const returnExpression = expressionStatement(
						logicalExpression(
							'&&',
							unaryExpression('!', identifier(completedName)),
							sequenceExpression([
								assignmentExpression(
									'=',
									identifier(resultName),
									inlinedStatement.argument || identifier('undefined')
								),
								assignmentExpression(
									'=',
									identifier(completedName),
									booleanLiteral(true)
								),
							])
						)
					);
					inlinedBody.push(returnExpression);
					continue;
				}

				traverse(
					inlinedStatement,
					{
						// Transform return statements into assignments with completion flag
						ReturnStatement(returnPath) {
							hasReturn = true;
							const returnExpression = expressionStatement(
								logicalExpression(
									'&&',
									unaryExpression('!', identifier(completedName)),
									sequenceExpression([
										assignmentExpression(
											'=',
											identifier(resultName),
											returnPath.node.argument || identifier('undefined')
										),
										assignmentExpression(
											'=',
											identifier(completedName),
											booleanLiteral(true)
										),
									])
								)
							);

							returnPath.replaceWith(returnExpression);
						},
						VariableDeclarator(varPath) {
							if (isIdentifier(varPath.node.id)) {
								const oldName = varPath.node.id.name;
								const newName = `${oldName}${uniqueSuffix}`;
								variableNames.set(oldName, newName);
								varPath.node.id.name = newName;
							}
						},
						Identifier(idPath) {
							// Replace parameters.
							if (paramMappings.has(idPath.node.name)) {
								const param = paramMappings.get(idPath.node.name)!;
								idPath.replaceWith(param);
								return;
							}
							// Replace renamed variables.
							if (variableNames.has(idPath.node.name)) {
								idPath.node.name = variableNames.get(idPath.node.name)!;
							}
						},
					},
					path.scope
				);

				if (hasReturn) {
					// Create a short-circuit expression: !completed && (statement)
					const rightExpression = isStatement(inlinedStatement)
						? convertStatementToExpression(inlinedStatement)
						: (inlinedStatement as unknown as Expression);

					const expression = logicalExpression(
						'&&',
						unaryExpression('!', identifier(completedName)),
						rightExpression
					);

					inlinedBody.push(expressionStatement(expression));
				} else {
					// If no returns found yet, just add the statement normally
					inlinedBody.push(inlinedStatement);
				}
			}

			if (hasReturn) {
				// Prepend our control variables
				inlinedBody.unshift(
					variableDeclaration('let', [variableDeclarator(identifier(resultName), null)]),
					variableDeclaration('let', [
						variableDeclarator(identifier(completedName), booleanLiteral(false)),
					])
				);
				// Replace the call with our result variable
				path.replaceWith({ type: 'Identifier', name: resultName });
			} else {
				// No returns found, just return undefined
				path.replaceWith({ type: 'Identifier', name: 'undefined' });
			}

			// Insert our transformed code before the original call
			const statementPath = path.getStatementParent();
			if (statementPath) statementPath.insertBefore(inlinedBody);
		},
	});

	const { code } = generate(ast);

	return code;
}

function convertStatementToExpression(statement: Statement): Expression {
	// If it's already an ExpressionStatement, return its expression
	if (statement.type === 'ExpressionStatement') {
		return statement.expression;
	}

	// For blocks, convert to sequence expression
	if (statement.type === 'BlockStatement') {
		return sequenceExpression(statement.body.map((stmt) => convertStatementToExpression(stmt)));
	}

	// For if statements, convert to conditional expression
	if (statement.type === 'IfStatement') {
		return conditionalExpression(
			statement.test,
			convertStatementToExpression(statement.consequent),
			statement.alternate
				? convertStatementToExpression(statement.alternate)
				: identifier('undefined')
		);
	}

	// Default case - wrap in void operator if we can't convert
	return unaryExpression('void', numericLiteral(0));
}
