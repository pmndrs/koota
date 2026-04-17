import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Use require to resolve the path to installed packages
const require = createRequire(import.meta.url);
const currentDir = dirname(fileURLToPath(import.meta.url));
const PUBLISH_TESTS_DIR = join(currentDir, '../tests');
const verbose = process.argv.includes('--verbose') || process.argv.includes('-v');

const PACKAGES = [
    {
        name: 'core',
        package: '@koota/core',
        importPath: '../../dist',
    },
    {
        name: 'react',
        package: '@koota/react',
        importPath: '../../react',
    },
] as const;

function isTestFile(path: string): boolean {
    return path.endsWith('.test.ts') || path.endsWith('.test.tsx');
}

function transformImports(content: string, pkg: (typeof PACKAGES)[number]): string {
    // Replace imports from other packages with their publish import paths.
    content = content.replace(/from ['"]@koota\/([^'"]+)['"]/g, (_, pkgName) => {
        const targetPkg = PACKAGES.find((p) => p.name === pkgName);
        return targetPkg ? `from '${targetPkg.importPath}'` : `from '@koota/${pkgName}'`;
    });

    // Replace local source imports with the built package entrypoint.
    return content.replace(/from ['"]\.\.\/src['"]/g, `from '${pkg.importPath}'`);
}

async function getFiles(dir: string, prefix = ''): Promise<string[]> {
    const entries = await readdir(join(dir, prefix), { withFileTypes: true });
    const files = await Promise.all(
        entries.map(async (entry) => {
            const relativePath = join(prefix, entry.name);
            if (entry.isDirectory()) return getFiles(dir, relativePath);
            return [relativePath];
        })
    );

    return files.flat();
}

async function processPackage(pkg: (typeof PACKAGES)[number]): Promise<number> {
    const sourceDir = join(dirname(require.resolve(pkg.package)), '../tests');
    const targetDir = join(PUBLISH_TESTS_DIR, pkg.name);

    const files = await getFiles(sourceDir);
    const testFiles = files.filter(isTestFile);
    if (verbose) console.log(`\n> Found ${testFiles.length} ${pkg.name} test files to process`);

    for (const file of files) {
        const sourcePath = join(sourceDir, file);
        const targetPath = join(targetDir, file);
        await mkdir(dirname(targetPath), { recursive: true });

        let content = await readFile(sourcePath, 'utf-8');
        content = transformImports(content, pkg);

        await writeFile(targetPath, content);
        if (verbose) console.log(`  ✓ ${pkg.name}/${file}`);
    }

    return testFiles.length;
}

async function generateTests() {
    if (verbose) console.log('\n> Preparing to generate tests...');
    try {
        await rm(PUBLISH_TESTS_DIR, { recursive: true, force: true });
    } catch (_error) {
        // Ignore if directory doesn't exist
    }

    // Create test directories for each package
    await Promise.all(
        PACKAGES.map((pkg) => mkdir(join(PUBLISH_TESTS_DIR, pkg.name), { recursive: true }))
    );

    // Process each package's tests
    const counts: Record<string, number> = {};
    for (const pkg of PACKAGES) {
        counts[pkg.name] = await processPackage(pkg);
    }

    if (verbose) {
        console.log('\n> Test generation complete!\n');
    } else {
        const summary = Object.entries(counts)
            .map(([name, count]) => `${count} ${name}`)
            .join(', ');
        console.log(`✓ Generated ${summary} tests`);
    }
}

generateTests();
