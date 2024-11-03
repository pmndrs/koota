import fs from 'fs/promises';
import path from 'path';

const sourceDir = 'dist';
const targetDir = 'react';

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

		// Update imports in all files
		for (const file of ['index.js', 'index.cjs', 'index.d.ts', 'index.d.cts']) {
			const filePath = path.join(targetDir, file);
			const content = await fs.readFile(filePath, 'utf-8');

			// Replace relative imports with paths pointing to dist folder
			const updatedContent = content.replace(
				/(from\s+['"])\.\.?\/(.*?)(['"])/g,
				`$1../${sourceDir}/$2$3`
			);

			await fs.writeFile(filePath, updatedContent);
			console.log(`Updated imports in ${file}`);
		}

		console.log('React files copied and renamed successfully.');
	} catch (error) {
		console.error('Error copying React files:', error);
	}
}

copyAndRename();
