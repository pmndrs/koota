import {
	ArrowFunctionExpression,
	blockStatement,
	BlockStatement,
	FunctionDeclaration,
	FunctionExpression,
	isArrowFunctionExpression,
	returnStatement,
} from '@babel/types';

// Return a statement array with expressions normalized to return statements.
export function getFunctionBody(
	func: FunctionDeclaration | ArrowFunctionExpression | FunctionExpression
): BlockStatement {
	if (isArrowFunctionExpression(func)) {
		if (func.body.type !== 'BlockStatement') return blockStatement([returnStatement(func.body)]);
		return func.body;
	}

	if (!func.body) {
		return blockStatement([]);
	}

	return func.body;
}
