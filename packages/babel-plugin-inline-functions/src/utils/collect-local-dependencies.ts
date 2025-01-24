import { Binding, NodePath } from '@babel/traverse';
import { FunctionDeclaration, Node, VariableDeclarator } from '@babel/types';
import { getFunctionNameFromPath } from './get-function-name-from-path';

type LocalDependency = {
	name: string;
	declaration: Node;
	binding: Binding;
	fullPath?: string;
	dependencies?: Set<string>;
};

const functionLocalDeps = new Map<string, Map<string, LocalDependency>>();

export function getFunctionLocalDeps(name: string) {
	return functionLocalDeps.get(name);
}

export function collectLocalDependencies(path: NodePath<FunctionDeclaration | VariableDeclarator>) {
	const name = getFunctionNameFromPath(path);
	if (!name) return;

	const localDeps = new Map<string, LocalDependency>();

	// Traverse the function body to find all local dependencies.
	path.traverse({
		Identifier(idPath) {
			// Skip if this is the function name itself.
			if (idPath.node.name === name) return;

			// Skip if this identifier is already collected.
			if (localDeps.has(idPath.node.name)) return;

			// Find the binding for this identifier.
			const binding = idPath.scope.getBinding(idPath.node.name);
			if (!binding) return;

			// Only process bindings from the same file.
			if (binding.path.hub !== path.hub) return;

			// Only collect module-level declarations and imports
			const isModuleScope = binding.scope.path.isProgram();
			const isImport =
				binding.path.isImportSpecifier() ||
				binding.path.isImportDefaultSpecifier() ||
				binding.path.isImportNamespaceSpecifier();

			if (!isModuleScope && !isImport) return;

			const declaration = binding.path.node;
			if (!isImport && declaration.type !== 'VariableDeclarator') return;

			const parentDeclaration = binding.path.parentPath?.node;
			if (!parentDeclaration) return;

			localDeps.set(idPath.node.name, {
				name: idPath.node.name,
				declaration: parentDeclaration,
				binding: binding,
				dependencies: collectTransitiveDependencies(binding.path),
				fullPath: binding.path.node.loc?.filename,
			});
		},
	});

	functionLocalDeps.set(name, localDeps);
}

function collectTransitiveDependencies(path: NodePath): Set<string> {
	const deps = new Set<string>();

	// Collect all identifiers in the local scope.
	path.traverse({
		Identifier(idPath) {
			const binding = idPath.scope.getBinding(idPath.node.name);
			if (binding && binding.path.hub === path.hub) {
				deps.add(idPath.node.name);
			}
		},
	});

	return deps;
}
