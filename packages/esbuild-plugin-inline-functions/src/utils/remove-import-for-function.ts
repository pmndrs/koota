import { NodePath } from '@babel/traverse';
import { getModuleProgram } from './get-module-program';

export function removeImportForFunction(path: NodePath, name: string) {
	const moduleProgram = getModuleProgram(path);
	if (!moduleProgram) return;

	// Find and remove the specifier for the inlined function
	for (const node of moduleProgram.body) {
		if (node.type === 'ImportDeclaration') {
			const specifierIndex = node.specifiers.findIndex((spec) => spec.local.name === name);

			if (specifierIndex !== -1) {
				// Store the import path before removing
				const importPath = node.source.value;

				// Remove just the specifier
				node.specifiers.splice(specifierIndex, 1);

				// If no specifiers left, remove the entire import declaration
				if (node.specifiers.length === 0) {
					moduleProgram.body = moduleProgram.body.filter((n) => n !== node);
				}

				return importPath;
			}
		}
	}
}
