import { execSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// Parse the command-line arguments
const args = process.argv.slice(2);

// Find the suite name (first arg that doesn't start with --)
const suiteName = args.find((arg) => !arg.startsWith('--'));
const isSim = args.includes('--sim');

const executeExample = (directoryPath: string) => {
    // EXACT match to how app.ts handled execution
    process.chdir(directoryPath);

    if (isSim) {
        // Delegates entirely to your package.json "sim" command (e.g., tsx src/sim/main.ts)
        execSync(`pnpm run sim`, { stdio: 'inherit' });
    } else {
        // Delegates entirely to your package.json "dev" command (e.g., vite)
        execSync(`pnpm run dev`, { stdio: 'inherit' });
    }
};

const runSuites = async (example: string) => {
    const rootPath = process.cwd();
    const baseDir = join(rootPath, 'examples');
    const exampleDir = join(baseDir, example);

    if (existsSync(exampleDir) && readdirSync(baseDir).includes(example)) {
        executeExample(exampleDir);
    } else {
        console.error(`Example not found: ${example}`);
    }
};

if (!suiteName) {
    console.error('Please provide an example name as an argument.');
    process.exit(1);
}

runSuites(suiteName);