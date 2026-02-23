import { execSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { COLORS } from './constants/colors';

// Define your Node/V8 specific arguments
const nodeArgs = [
    '--allow-natives-syntax',
    // '--trace-opt',
    // '--trace-deopt',
    '--expose-gc',
];

// Parse the command-line arguments
const args = process.argv.slice(2);

// Retrieve the suite name and engine type from parsed arguments
const suiteName = args.find(arg => !arg.startsWith('-'));
const bunArg = args.includes('--bun');

// Function to execute the main.ts file within a directory
const executeMainTs = (directoryPath: string, name: string, engine: string = 'bun') => {
    const mainTsPath = join(directoryPath, 'src/main.ts');
    // Check if main.ts exists in the directory
    if (existsSync(mainTsPath)) {
        console.log(
            `Executing ${COLORS.fg.blue}${name}${COLORS.reset} using ${COLORS.fg.yellow}${engine}${COLORS.reset}`
        );
        // Execute the main.ts file
        const flags = nodeArgs.join(' ');
        execSync(`pnpm dlx tsx ${flags} ${mainTsPath}`, { stdio: 'inherit' });
        // note don't think bun supports v8 nodeArgs flags
        // if (engine === 'bun') execSync(`bun run ${mainTsPath}`, { stdio: 'inherit' });
    } else {
        console.error(`Error: src/main.ts not found in ${directoryPath}`);
    }
};
// Function to find and run main.ts files for the specified suite
const runSuites = () => {
    const rootPath = process.cwd();
    const baseDir = join(rootPath, 'benches');
    const engine = bunArg ? 'bun' : 'node';

    // Ensure the benches directory exists before proceeding
    if (!existsSync(baseDir)) {
        console.error(`Benches directory not found at: ${baseDir}`);
        process.exit(1);
    }

    if (suiteName) {
        const simDir = join(baseDir, suiteName);
        if (existsSync(simDir)) {
            executeMainTs(simDir, suiteName, engine);
        } else {
            console.error(`Suite directory not found: ${suiteName}`);
            process.exit(1);
        }
    } else {
        console.log(`No specific suite provided. Running all benches...`);
        const entries = readdirSync(baseDir, { withFileTypes: true });

        for (const entry of entries) {
            if (entry.isDirectory()) {
                const simDir = join(baseDir, entry.name);
                executeMainTs(simDir, entry.name, engine);
            }
        }
    }
};

runSuites();