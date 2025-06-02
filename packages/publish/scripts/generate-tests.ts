import { mkdir, readdir, readFile, rm, writeFile } from 'fs/promises';
import { createRequire } from 'module';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

// Use require to resolve the path to installed packages
const require = createRequire(import.meta.url);
const currentDir = dirname(fileURLToPath(import.meta.url));
const PUBLISH_TESTS_DIR = join(currentDir, '../tests');

const PACKAGES = [
	{ name: 'core', package: '@koota/core' },
	// { name: 'react', package: '@koota/react' },
] as const;

async function processPackage(pkg: (typeof PACKAGES)[number]) {
	const sourceDir = join(dirname(require.resolve(pkg.package)), '../tests');
	const targetDir = join(PUBLISH_TESTS_DIR, pkg.name);

	const files = await readdir(sourceDir);
	const testFiles = files.filter((file) => file.endsWith('.test.ts'));
	console.log(`> Found ${testFiles.length} ${pkg.name} test files to process\n`);

	for (const file of testFiles) {
		const sourcePath = join(sourceDir, file);
		const targetPath = join(targetDir, file);

		let content = await readFile(sourcePath, 'utf-8');
		content = content.replace(/from ['"]\.\.\/src['"]/g, "from '../../dist'");
		await writeFile(targetPath, content);
		console.log(`✓ ${pkg.name}/${file}`);
	}
}

async function generateTests() {
	console.log('\n> Preparing to generate tests...');
	try {
		await rm(PUBLISH_TESTS_DIR, { recursive: true, force: true });
	} catch (error) {
		// Ignore if directory doesn't exist
	}

	// Create test directories for each package
	await Promise.all(
		PACKAGES.map((pkg) => mkdir(join(PUBLISH_TESTS_DIR, pkg.name), { recursive: true }))
	);

	// Process each package's tests
	for (const pkg of PACKAGES) {
		await processPackage(pkg);
	}

	console.log('\n> Test generation complete!\n');
}

generateTests();
