import { NodePath } from '@babel/traverse';
import { getModuleProgram } from './get-module-program';
import { getFunctionLocalDeps } from './collect-local-dependencies';
import { createRelativePath } from './create-relative-path';
import { identifier, importDeclaration, importSpecifier, stringLiteral } from '@babel/types';

export function addImportsForDependencies(path: NodePath, name: string) {
	const moduleProgram = getModuleProgram(path);
	const localDeps = getFunctionLocalDeps(name);

	if (localDeps && localDeps.size > 0 && moduleProgram) {
		// Find the last import declaration, if any
		const lastImportIndex = moduleProgram.body.reduce((acc, node, index) => {
			return node.type === 'ImportDeclaration' ? index : acc;
		}, -1);

		for (const [name, dep] of localDeps) {
			const currentPath = path.node.loc?.filename;
			const importPath = dep.fullPath;
			if (!importPath || !currentPath) continue;

			// Check if the import already exists.
			const importExists = moduleProgram.body.some(
				(node) =>
					node.type === 'ImportDeclaration' &&
					node.specifiers.some((spec) => spec.local.name === name)
			);

			if (importExists) continue;

			// Create a relative path to the import.
			const relativePath = createRelativePath(currentPath, importPath);

			// Create an import declaration for each local dependency and add it to the program.
			const importDecl = importDeclaration(
				[importSpecifier(identifier(name), identifier(name))],
				stringLiteral(relativePath)
			);

			/// Insert after the last import, or at the start of the program (after directives)
			const insertIndex = lastImportIndex !== -1 ? lastImportIndex + 1 : 0;
			moduleProgram.body.splice(insertIndex, 0, importDecl);
		}
	}
}
