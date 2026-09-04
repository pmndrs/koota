import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const rootDir = join('..', '..');

// The README links to files under docs/ with relative paths. Copying those
// files alongside it keeps the links working inside the published package.
async function copyReadme() {
    try {
        console.log('\n> Copying README.md...');
        const readme = await readFile(join(rootDir, 'README.md'), 'utf8');
        await writeFile('README.md', readme);

        await rm('docs', { recursive: true, force: true });
        const docs = new Set(readme.matchAll(/\]\((docs\/[^)#]+\.md)/g).map((match) => match[1]));
        for (const doc of docs) {
            await mkdir(dirname(doc), { recursive: true });
            await copyFile(join(rootDir, doc), doc);
            console.log(`  ✓ ${doc}`);
        }

        console.log('✓ README.md copied successfully\n');
    } catch (error) {
        console.error('\n> Error copying README.md:', error);
        process.exit(1);
    }
}

copyReadme();
