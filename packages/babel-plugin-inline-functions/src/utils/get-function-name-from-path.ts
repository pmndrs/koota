import { NodePath } from '@babel/traverse';
import { FunctionDeclaration, VariableDeclarator } from '@babel/types';

export function getFunctionNameFromPath(path: NodePath<FunctionDeclaration | VariableDeclarator>) {
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
