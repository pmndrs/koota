import { NodePath } from '@babel/traverse';
import {
	FunctionDeclaration,
	VariableDeclarator,
	Function,
	isAssignmentExpression,
	isIdentifier,
	isMemberExpression,
} from '@babel/types';

export function getFunctionNameFromDeclaration(
	path: NodePath<FunctionDeclaration | VariableDeclarator>
) {
	let name: string | undefined;

	if (path.node.type === 'VariableDeclarator') {
		const init = path.node.init;
		if (init && (init.type === 'ArrowFunctionExpression' || init.type === 'FunctionExpression')) {
			name = (path.node.id as any).name;
		}
	} else {
		name = path.node.id?.name;
	}

	return name;
}

export function getFunctionName(path: NodePath<Function>) {
	let name = '';
	const node = path.node as { id?: { name: string } };
	if (node.id) {
		name = node.id.name;
	}
	if (isAssignmentExpression(path.parentPath.node)) {
		if (isIdentifier(path.parentPath.node.left)) {
			name = path.parentPath.node.left.name;
		} else if (isMemberExpression(path.parentPath.node.left)) {
			name = isIdentifier(path.parentPath.node.left.property)
				? path.parentPath.node.left.property.name
				: '';
		}
	}

	return name;
}
