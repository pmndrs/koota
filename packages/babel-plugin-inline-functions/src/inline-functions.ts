import _generate from '@babel/generator';
import { ParseResult } from '@babel/parser';
import _traverse from '@babel/traverse';
import {
	ArrowFunctionExpression,
	assignmentExpression,
	blockStatement,
	booleanLiteral,
	cloneNode,
	Expression,
	ExpressionStatement,
	expressionStatement,
	File,
	FunctionDeclaration,
	FunctionExpression,
	identifier,
	isBlockStatement,
	isIdentifier,
	isIfStatement,
	logicalExpression,
	Node,
	ReturnStatement,
	sequenceExpression,
	Statement,
	unaryExpression,
	variableDeclaration,
	variableDeclarator,
} from '@babel/types';
import { addImportsForDependencies } from './utils/add-import-for-dependencies';
import { collectLocalDependencies } from './utils/collect-local-dependencies';
import { convertStatementToExpression } from './utils/convert-statement-to-expression';
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

			const body = getFunctionBody(inlinableFn.func);
			const variableNames = new Map<string, string>();
			const uniqueSuffix = `_${uniqueCounter++}`;

			// Count return statements
			let returnCount = 0;
			let lastReturnStatement: ReturnStatement;

			traverse(
				blockStatement(body),
				{
					ReturnStatement(path) {
						returnCount++;
						lastReturnStatement = path.node;
					},
				},
				path.scope
			);

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
			const inlinedBody = body.map((statement) => cloneNode(statement));

			let returnCounter = 0;

			const createReturnTransformation = (
				resultName: string,
				completedName: string,
				argument: Expression | null | undefined
			) => {
				// Now returns a sequence of all assignments
				return sequenceExpression([
					assignmentExpression(
						'=',
						identifier(resultName),
						argument || identifier('undefined')
					),
					assignmentExpression('=', identifier(completedName), booleanLiteral(true)),
				]);
			};

			traverse(
				blockStatement(inlinedBody),
				{
					IfStatement(ifPath) {
						let consequent = ifPath.node.consequent;
						let statements: Statement[];

						if (isBlockStatement(consequent)) {
							statements = consequent.body;
						} else {
							statements = [consequent];
						}

						// Transform the statements into a single sequence expression
						const nonReturnStatements = statements
							.filter((stmt) => stmt.type !== 'ReturnStatement')
							.map(convertStatementToExpression);

						const returnStatement = statements.find(
							(stmt) => stmt.type === 'ReturnStatement'
						);

						if (returnStatement) returnCounter++;

						const allExpressions = [
							...nonReturnStatements,
							returnStatement &&
								createReturnTransformation(
									resultName,
									completedName,
									returnStatement.argument
								),
						].filter(Boolean) as Expression[];

						// Create a chain with only the condition and completion check
						const chainedExpression = logicalExpression(
							'&&',
							logicalExpression(
								'&&',
								ifPath.node.test,
								unaryExpression('!', identifier(completedName))
							),
							sequenceExpression(allExpressions)
						);

						ifPath.replaceWith(expressionStatement(chainedExpression));
					},
					// Transform return statements into assignments with completion flag
					ReturnStatement(returnPath) {
						returnCounter++;

						// Only handle returns that aren't inside if statements
						if (isIfStatement(returnPath.parent)) {
							return;
						}

						hasReturn = true;
						let returnExpression: ExpressionStatement;

						if (returnCounter === returnCount) {
							returnExpression = expressionStatement(
								logicalExpression(
									'&&',
									unaryExpression('!', identifier(completedName)),
									assignmentExpression(
										'=',
										identifier(resultName),
										returnPath.node.argument || identifier('undefined')
									)
								)
							);
						} else {
							returnExpression = expressionStatement(
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
						}

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

			console.log(callee.name, returnCounter);

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
