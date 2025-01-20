import _generate from '@babel/generator';
import { ParseResult } from '@babel/parser';
import _traverse from '@babel/traverse';
import {
	blockStatement,
	booleanLiteral,
	cloneNode,
	Expression,
	ExpressionStatement,
	File,
	identifier,
	isBlockStatement,
	isIdentifier,
	LogicalExpression,
	ReturnStatement,
	SequenceExpression,
	Statement,
	variableDeclaration,
	variableDeclarator,
} from '@babel/types';
import { inlinableFunctions } from './collect-inlinable-functions';
import { addImportsForDependencies } from './utils/add-import-for-dependencies';
import { convertStatementToExpression } from './utils/convert-statement-to-expression';
import { createShortCircuit, createShortCircuitAssignment } from './utils/create-short-circuit';
import { getFunctionBody } from './utils/get-function-content';
import { removeImportForFunction } from './utils/remove-import-for-function';

// Depending on the version of babel, the default export may be different.
const generate = (_generate as unknown as { default: typeof _generate }).default || _generate;
const traverse = (_traverse as unknown as { default: typeof _traverse }).default || _traverse;

export function inlineFunctions(ast: ParseResult<File>) {
	let uniqueCounter = 0;

	// Inline all invocations of the inlinable functions.
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
			const inlinedBody = body.map((statement) => cloneNode(statement));
			const variableNames = new Map<string, string>();
			const uniqueSuffix = `_${uniqueCounter++}`;
			const resultName = `result_${callee.name}_${uniqueSuffix}`;
			const completedName = `completed_${callee.name}_${uniqueSuffix}`;
			const returnStatements: ReturnStatement[] = [];
			const ifStatements: ExpressionStatement[] = [];

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
						// Replace parameters and rename variables assignments.
						if (paramMappings.has(idPath.node.name)) {
							idPath.replaceWith(paramMappings.get(idPath.node.name)!);
						} else if (variableNames.has(idPath.node.name)) {
							idPath.node.name = variableNames.get(idPath.node.name)!;
						}
					},
					ReturnStatement(returnPath) {
						returnStatements.push(returnPath.node);
					},
					IfStatement(ifPath) {
						let consequent = ifPath.node.consequent;
						let statements: Statement[];
						const suffix = `_${Math.random().toString(36).substring(2, 15)}`;
						const localVars = new Set<string>();

						// Collect statements.
						if (isBlockStatement(consequent)) statements = consequent.body;
						else statements = [consequent];

						traverse(
							blockStatement(statements),
							{
								ReturnStatement(returnPath) {
									// Collect return statements.
									returnStatements.push(returnPath.node);
								},
								VariableDeclarator(varPath) {
									// Collect local variables.
									if (isIdentifier(varPath.node.id)) {
										localVars.add(varPath.node.id.name);
									}
								},
							},
							path.scope
						);

						// Transform if statement into a short circuit with chained expressions.
						const expressions = statements.map((stmt) =>
							convertStatementToExpression(
								stmt,
								completedName,
								resultName,
								suffix,
								localVars
							)
						);
						const chainedExpression = createShortCircuit(ifPath.node.test, expressions);
						ifPath.replaceWith(chainedExpression);

						// Collect if statements.
						ifStatements.push(chainedExpression);
					},
				},
				path.scope
			);

			if (returnStatements.length === 1) {
				const lastReturnStatement = returnStatements[returnStatements.length - 1];
				// Remove from the inlined body.
				const index = inlinedBody.indexOf(lastReturnStatement);
				if (index !== -1) inlinedBody.splice(index, 1);

				// Replace function call with assignment of the return value to the call identifier.
				const expression = lastReturnStatement.argument || identifier('undefined');
				path.replaceWith(expression);
			} else if (returnStatements.length > 1) {
				const lastReturnStatement = returnStatements[returnStatements.length - 1];
				// // Remove from the inlined body.
				// const index = inlinedBody.indexOf(lastReturnStatement);
				// if (index !== -1) inlinedBody.splice(index, 1);

				// Prepend our control variables.
				inlinedBody.unshift(
					variableDeclaration('let', [variableDeclarator(identifier(resultName), null)]),
					variableDeclaration('let', [
						variableDeclarator(identifier(completedName), booleanLiteral(false)),
					])
				);

				// Transform the if statement to have a short circuit.
				for (const ifStmnt of ifStatements) {
					const index = inlinedBody.indexOf(ifStmnt);

					const shortCircuit = createShortCircuit(
						(ifStmnt.expression as LogicalExpression).left,
						((ifStmnt.expression as LogicalExpression).right as SequenceExpression)
							.expressions,
						completedName
					);

					inlinedBody.splice(index, 1, shortCircuit);
				}

				// Transform the last return statement to have a short circuit assignment.
				const returnExpression = createShortCircuitAssignment(
					lastReturnStatement.argument || identifier('undefined'),
					completedName,
					resultName
				);

				const index = inlinedBody.indexOf(lastReturnStatement);
				if (index !== -1) inlinedBody.splice(index, 1, returnExpression);

				// Replace the function call with our result variable.
				path.replaceWith({ type: 'Identifier', name: resultName });
			}

			// Insert our transformed code before the original call.
			const statementPath = path.getStatementParent();
			if (statementPath) statementPath.insertBefore(inlinedBody);
		},
	});

	const { code } = generate(ast);

	return code;
}
