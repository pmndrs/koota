import { copyFile } from 'node:fs/promises';
import { join } from 'node:path';

const sourceFile = join('..', '..', 'README.md');
const destinationFile = 'README.md';

async function copyReadme() {
    try {
        console.log('\n> Copying README.md...');
        await copyFile(sourceFile, destinationFile);
        console.log('✓ README.md copied successfully\n');
    } catch (error) {
        console.error('\n> Error copying README.md:', error);
        process.exit(1);
    }
}

copyReadme();
