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

		console.log('React files copied and renamed successfully.');
	} catch (error) {
		console.error('Error copying React files:', error);
	}
}

copyAndRename();
