import fs from 'fs/promises';
import path from 'path';

const sourceDir = 'dist';
const targetDir = 'react';

async function findTypeImports(filePath: string): Promise<string[]> {
	const content = await fs.readFile(filePath, 'utf-8');
	// Match import statements and reference directives
	const importRegex = /from\s+['"](.+?)['"]|\/\/\/\s*<reference\s+path\s*=\s*['"](.+?)['"]/g;
	const imports: string[] = [];

	let match;
	while ((match = importRegex.exec(content)) !== null) {
		const importPath = match[1] || match[2];
		if (importPath && !importPath.startsWith('.')) continue; // Skip non-relative imports

		// Remove any existing extension and add .d.ts
		const withoutExtension = importPath.replace(/\.(d\.ts|ts|js|jsx|tsx)$/, '');
		// Add both .d.ts and .d.cts versions
		imports.push(`${withoutExtension}.d.ts`);
		imports.push(`${withoutExtension}.d.cts`);
	}

	return imports;
}

async function copyAndRename() {
	try {
		// Ensure the target directory exists
		await fs.mkdir(targetDir, { recursive: true });

		const files = [
			{ src: 'react.cjs', dest: 'index.cjs' },
			{ src: 'react.js', dest: 'index.js' },
			{ src: 'react.d.ts', dest: 'index.d.ts' },
			{ src: 'react.d.cts', dest: 'index.d.cts' },
		];

		for (const file of files) {
			await fs.copyFile(path.join(sourceDir, file.src), path.join(targetDir, file.dest));
			console.log(`Copied ${file.src} to ${targetDir}/${file.dest}`);
		}

		// Check index.d.ts for additional dependencies
		const dtsPath = path.join(targetDir, 'index.d.ts');
		const additionalImports = await findTypeImports(dtsPath);

		// Copy additional type definition files
		for (const importPath of additionalImports) {
			const sourcePath = path.join(sourceDir, importPath);
			const targetPath = path.join(targetDir, importPath);

			// Create target directory if needed
			await fs.mkdir(path.dirname(targetPath), { recursive: true });

			try {
				await fs.copyFile(sourcePath, targetPath);
				console.log(`Copied additional dependency: ${importPath}`);
			} catch (err) {
				console.warn(`Warning: Could not copy ${importPath}:`, err);
			}
		}

		console.log('React files copied and renamed successfully.');
	} catch (error) {
		console.error('Error copying React files:', error);
	}
}

copyAndRename();
