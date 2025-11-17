import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join, sep } from 'node:path';

const args = process.argv.slice(2);
const benchPath = args[0];

const runMicro = (baseDir: string, benchDir: string) => {
	execFileSync('node', [
			// '--inspect-brk',
			`${baseDir}/run.js`,
			`${benchDir}`
		], 
		{ stdio: 'inherit' });
};

const runSuites = async (benchPath: string) => {
	const rootPath = process.cwd();
	const baseDir = join(rootPath, 'benches', 'micro');
	const testDir = join(baseDir, 'tests')
	const benchDir = join(testDir, benchPath);

	if (existsSync(benchDir) && readdirSync(testDir).includes(benchPath.split(sep)[0])) {
		console.log("runMicro")
		runMicro(baseDir, benchDir);
	} else {
		console.error(`Suite not found: ${benchPath}`);
	}
	// todo: run all tests? - put an index.js here later
	// runMicro(baseDir)
};

// Run the suites
runSuites(benchPath);
