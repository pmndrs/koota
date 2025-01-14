import {
	ArrowFunctionExpression,
	FunctionDeclaration,
	FunctionExpression,
	isIdentifier,
} from '@babel/types';

export function getFunctionParams(
	node: FunctionDeclaration | ArrowFunctionExpression | FunctionExpression
) {
	const params = node.params
		.map((param) => (isIdentifier(param) ? param.name : null))
		.filter(Boolean) as string[];
	return params;
}
