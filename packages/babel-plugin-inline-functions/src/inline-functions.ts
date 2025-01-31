import _generate from '@babel/generator';
import { ParseResult } from '@babel/parser';
import _traverse, { NodePath } from '@babel/traverse';
import {
	AssignmentExpression,
	assignmentExpression,
	blockStatement,
	cloneNode,
	Expression,
	expressionStatement,
	ExpressionStatement,
	File,
	Function,
	identifier,
	IfStatement,
	isBlockStatement,
	isIdentifier,
	isMemberExpression,
	variableDeclaration,
	variableDeclarator,
} from '@babel/types';
import {
	InlinableFunction,
	inlinableFunctionCalls,
	inlinableFunctions,
} from './collect-inlinable-functions';
import { addImportsForDependencies } from './utils/add-import-for-dependencies';
import { getFunctionBody } from './utils/get-function-content';
import { hasInlineDecorator, removeInlineDecorator } from './utils/inline-decorator-utils';
import { removeImportForFunction } from './utils/remove-import-for-function';

// Depending on the version of babel, the default export may be different.
const generate = (_generate as unknown as { default: typeof _generate }).default || _generate;
const traverse = (_traverse as unknown as { default: typeof _traverse }).default || _traverse;

export function inlineFunctions(ast: ParseResult<File>) {
	let uniqueCounter = 0;
	const transformedFunctions = new Set<NodePath<Function>>();

	// Inline all invocations of the inlinable functions.
	traverse(ast, {
		CallExpression(path) {
			const callee = path.node.callee;

			// Only support named function calls -- ie not methods or accessors.
			if (!isIdentifier(callee)) return;

			let inlinableFn: InlinableFunction | undefined;

			if (inlinableFunctions.has(callee.name)) {
				inlinableFn = inlinableFunctions.get(callee.name)!;
			} else if (inlinableFunctionCalls.has(callee.name) && hasInlineDecorator(path.node)) {
				inlinableFn = inlinableFunctionCalls.get(callee.name)!;
			}

			if (!inlinableFn) return;

			// Collect functions we are transforming so we can do a final pass later.
			const containingFunction = path.getFunctionParent();
			if (containingFunction) transformedFunctions.add(containingFunction);

			// Remove @inline leading comments
			removeInlineDecorator(path.node);

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
			const inlinedBody = body.map((statement) => cloneNode(statement));
			const variableNames = new Map<string, string>();
			const uniqueSuffix = `_${uniqueCounter++}_$f`;
			const resultName = `result_${callee.name}${uniqueSuffix}`;
			const returnStatements: ExpressionStatement[] = [];
			const ifStatements: IfStatement[] = [];

			traverse(
				blockStatement(inlinedBody),
				{
					VariableDeclarator(varPath) {
						// Rename variables to avoid conflicts.
						if (isIdentifier(varPath.node.id)) {
							const oldName = varPath.node.id.name;
							const newName = `${oldName}${uniqueSuffix}`;
							variableNames.set(oldName, newName);
							varPath.node.id.name = newName;
						}
					},
					Identifier(idPath) {
						// Skip renaming if this identifier is a property access
						if (
							isMemberExpression(idPath.parent) &&
							idPath.parentKey === 'property' &&
							!idPath.parent.computed
						) {
							return;
						}

						// Replace parameters and rename variables assignments.
						if (paramMappings.has(idPath.node.name)) {
							idPath.replaceWith(paramMappings.get(idPath.node.name)!);
						} else if (variableNames.has(idPath.node.name)) {
							idPath.node.name = variableNames.get(idPath.node.name)!;
						}
					},
					ReturnStatement(returnPath) {
						// Replace return statement with result assignment
						const returnExpression = expressionStatement(
							assignmentExpression(
								'=',
								identifier(resultName),
								returnPath.node.argument || identifier('undefined')
							)
						);

						returnPath.replaceWith(returnExpression);

						returnStatements.push(returnPath.node as unknown as ExpressionStatement);
					},
					IfStatement(ifPath) {
						ifStatements.push(ifPath.node);
						let consequent = ifPath.node.consequent;
						let alternate = ifPath.node.alternate;

						// Convert consequent to block statement if it isn't already
						if (!isBlockStatement(consequent)) {
							ifPath.node.consequent = blockStatement([consequent]);
						}

						// Convert alternate to block statement if it exists and isn't already
						if (alternate && !isBlockStatement(alternate)) {
							ifPath.node.alternate = blockStatement([alternate]);
						}
					},
				},
				path.scope
			);

			// Transform if statements that don't have an else branch
			for (const ifStatement of ifStatements) {
				if (!ifStatement.alternate) {
					const ifIndex = inlinedBody.indexOf(ifStatement);
					if (ifIndex !== -1) {
						// Collect all statements that follow this if statement
						const remainingStatements = inlinedBody.splice(ifIndex + 1);
						// Create else block with the remaining statements
						ifStatement.alternate = blockStatement(remainingStatements);
					} else {
						// Fallback to empty else block if if statement not found
						ifStatement.alternate = blockStatement([]);
					}
				}
			}

			if (returnStatements.length === 1) {
				const lastReturnStatement = returnStatements[0];
				// Remove from the inlined body.
				const index = inlinedBody.indexOf(lastReturnStatement);
				if (index !== -1) inlinedBody.splice(index, 1);

				// Replace function call with assignment of the return value to the call identifier.
				const expression =
					(lastReturnStatement.expression as AssignmentExpression).right ||
					identifier('undefined');
				path.replaceWith(expression);
			} else if (returnStatements.length > 1) {
				// Prepend our control variables.
				inlinedBody.unshift(
					variableDeclaration('let', [variableDeclarator(identifier(resultName), null)])
				);

				// Replace the function call with our result variable.
				path.replaceWith({ type: 'Identifier', name: resultName });
			}

			// Insert our transformed code before the original call.
			const statementPath = path.getStatementParent();
			if (statementPath) statementPath.insertBefore(inlinedBody);
		},
	});

	for (const functionPath of transformedFunctions) {
		const expressionCounts = new Map<string, number>();
		const variableDeclarations = new Map<string, string>();
		const firstDeclarationForExpression = new Map<string, string>();
		const variablesToReplace = new Map<string, string>();

		// Remove duplicate memory access expressions if it is safe to do so.
		traverse(
			functionPath.node,
			{
				VariableDeclarator(path) {
					// Handle variable declarations
					if (!isIdentifier(path.node.id)) return;
					const variableName = path.node.id.name;
					if (!variableName.endsWith('_$f')) return;

					// Only dedup const declarations
					if (path.parent.type !== 'VariableDeclaration' || path.parent.kind !== 'const') {
						return;
					}

					const init = path.node.init;
					if (!init) return;

					let clonedInit = cloneNode(init);

					// Remove nullish type annotations.
					if (clonedInit.type === 'TSNonNullExpression') {
						clonedInit = clonedInit.expression;
					}

					let code = generate(clonedInit).code;

					// Replace any known variable references.
					for (const [varName, replacement] of variableDeclarations.entries()) {
						code = code.replace(`${varName}.`, replacement);
					}

					variableDeclarations.set(variableName, code);
					let expressionCount = expressionCounts.get(code) || 0;
					expressionCount++;
					expressionCounts.set(code, expressionCount);

					if (expressionCount > 1) {
						variablesToReplace.set(
							variableName,
							firstDeclarationForExpression.get(code)!
						);

						// Remove the declaration from the ast.
						path.remove();
					} else {
						firstDeclarationForExpression.set(code, variableName);
					}
				},
			},
			functionPath.scope
		);

		// Replace variables with their first declaration.
		traverse(
			functionPath.node,
			{
				Identifier(path) {
					const name = path.node.name;
					if (variablesToReplace.has(name)) {
						path.node.name = variablesToReplace.get(name)!;
					}
				},
			},
			functionPath.scope
		);
	}

	const { code } = generate(ast);

	return code;
}
