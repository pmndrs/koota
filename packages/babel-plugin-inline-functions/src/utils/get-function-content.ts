import {
	ArrowFunctionExpression,
	Expression,
	FunctionDeclaration,
	FunctionExpression,
	identifier,
	isArrowFunctionExpression,
	isReturnStatement,
	returnStatement,
	Statement,
} from '@babel/types';

export function getFunctionContent(
	func: FunctionDeclaration | ArrowFunctionExpression | FunctionExpression
): { body?: Statement[]; returnStatement?: Expression } {
	if (isArrowFunctionExpression(func)) {
		// Handle both cases for arrow functions:
		// 1. () => expression
		// 2. () => { return expression; }
		if (func.body.type === 'BlockStatement') {
			const returnStmt = func.body.body.find((stmt) => isReturnStatement(stmt));
			const bodyWithoutReturn = func.body.body.filter((stmt) => !isReturnStatement(stmt));
			return {
				body: bodyWithoutReturn,
				returnStatement: returnStmt?.argument || identifier('undefined'),
			};
		}
		return { body: undefined, returnStatement: func.body };
	} else {
		const returnStmt = func.body.body.find((stmt) => isReturnStatement(stmt));
		const bodyWithoutReturn = func.body.body.filter((stmt) => !isReturnStatement(stmt));
		return { body: bodyWithoutReturn, returnStatement: returnStmt?.argument || undefined };
	}
}

// Return a statement array with expressions normalized to return statements.
export function getFunctionBody(
	func: FunctionDeclaration | ArrowFunctionExpression | FunctionExpression
): Statement[] {
	if (isArrowFunctionExpression(func)) {
		if (func.body.type !== 'BlockStatement') return [returnStatement(func.body)];
		return func.body.body;
	}
	return func.body.body;
}
