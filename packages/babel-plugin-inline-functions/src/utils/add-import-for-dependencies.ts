import { NodePath } from '@babel/traverse';
import { getModuleProgram } from './get-module-program';
import { getFunctionDependencyChain, getFunctionLocalDeps } from './collect-local-dependencies';
import { createRelativePath, createRelativePathWithRelativePath } from './create-relative-path';
import {
	identifier,
	ImportDeclaration,
	importDeclaration,
	importSpecifier,
	stringLiteral,
} from '@babel/types';

export function addImportsForDependencies(
	path: NodePath,
	inlinePath: NodePath,
	name: string,
	inlinedImportPath?: string
) {
	const moduleProgram = getModuleProgram(path);
	const localDeps = getFunctionLocalDeps(name);
	const dependencyChain = getFunctionDependencyChain(name);

	if (localDeps && localDeps.size > 0 && moduleProgram) {
		for (const [depName, dep] of localDeps) {
			const currentPath = path.node.loc?.filename;
			const importPath = dep.fullPath;
			if (!importPath || !currentPath) continue;

			// Check if the import already exists in the file where transfomed code is.
			const importExists = moduleProgram.body.some(
				(node) =>
					node.type === 'ImportDeclaration' &&
					node.specifiers.some((spec) => spec.local.name === depName)
			);

			if (importExists) continue;

			// Check if the import already exists in the file where the inlined function is.
			const inlinedModuleProgram = getModuleProgram(inlinePath);
			const inlinedImportExists = inlinedModuleProgram?.body.some(
				(node) =>
					node.type === 'ImportDeclaration' &&
					node.specifiers.some((spec) => spec.local.name === depName)
			);

			let relativePath: string;

			if (inlinedImportExists) {
				const inlinedImport = inlinedModuleProgram?.body.find(
					(node) =>
						node.type === 'ImportDeclaration' &&
						node.specifiers.some((spec) => spec.local.name === depName)
				) as ImportDeclaration;

				relativePath = createRelativePathWithRelativePath(
					inlinedImport.source.value,
					inlinedImportPath || ''
				);
			} else {
				relativePath = createRelativePath(currentPath, importPath);
			}

			// Create an import declaration for each local dependency and add it to the program.
			const importDecl = importDeclaration(
				[importSpecifier(identifier(depName), identifier(depName))],
				stringLiteral(relativePath)
			);

			// Insert at the start of the program.
			moduleProgram.body.unshift(importDecl);
		}
	}

	if (dependencyChain.size > 0) {
		for (const funcName of dependencyChain) {
			addImportsForDependencies(path, inlinePath, funcName, inlinedImportPath);
		}
	}
}
