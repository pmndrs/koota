import { copyFile } from 'node:fs/promises';
import { join } from 'node:path';

const sourceFile = join('..', '..', 'README.md');
const destinationFile = 'README.md';

async function copyReadme() {
	try {
		await copyFile(sourceFile, destinationFile);
		console.log('README.md copied successfully');
	} catch (error) {
		console.error('Error copying README.md:', error);
		process.exit(1);
	}
}

copyReadme();
