import fs from 'node:fs/promises';
import path from 'node:path';

const sourceDir = 'dist';
const targetDir = 'react';

async function copyAndRename() {
	try {
		console.log('\n> Preparing to copy React files...');
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
			console.log(`✓ ${file.src} → ${targetDir}/${file.dest}`);
		}

		console.log('\n> Updating imports...');
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
			console.log(`✓ ${file}`);
		}

		console.log('\n> React files copied and updated successfully\n');
	} catch (error) {
		console.error('\n> Error copying React files:', error);
	}
}

copyAndRename();
