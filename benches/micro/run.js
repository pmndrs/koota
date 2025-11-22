import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import fs from 'node:fs';
import path from 'node:path';
import * as readline from 'node:readline/promises';

// --- Recreate __dirname for ES Modules ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const args = process.argv.slice(2);
const benchPath = args[0]; // This is the full path from micro.ts
const viewFlag = args[1]; // Optional --view flag

const logFile = path.resolve(__dirname, 'bench.log');

const nodeArgs = [
	'--allow-natives-syntax',
	// '--trace-opt',
	'--trace-deopt',
	'--expose-gc',
];

console.log(`\n[run.js] Running benchmark: ${benchPath}`);
console.log(`[run.js] Clearing old log file: ${logFile}\n`);
fs.writeFileSync(logFile, '');

// Run benchmark synchronously and wait for completion
const result = spawnSync('node', [...nodeArgs, benchPath], {
	stdio: ['inherit', 'pipe', 'pipe'],
	cwd: __dirname,
});

// Write output to log file
if (result.stdout) {
	fs.appendFileSync(logFile, result.stdout.toString());
}
if (result.stderr) {
	fs.appendFileSync(logFile, result.stderr.toString());
}

// Print summary to console (not the full output)
console.log('Benchmark output captured to log file');

if (result.status !== 0) {
	console.error(`\n[run.js] Benchmark failed with exit code ${result.status}`);
	process.exit(result.status);
}

console.log(`\n[run.js] ✓ Benchmark complete`);
console.log(`[run.js] Results: file://${logFile}`);

// If --view flag is passed, start Vite automatically
if (viewFlag === '--view') {
	console.log('[run.js] Starting results viewer...\n');
	spawn('pnpm', ['exec', 'vite'], {
		stdio: 'inherit',
		cwd: __dirname,
	});
} else {
	// Otherwise, prompt the user
	const rl = readline.createInterface({
		input: process.stdin,
		output: process.stdout,
	});

	const answer = await rl.question('\nView results in browser? (y/n): ');
	rl.close();

	if (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes') {
		console.log('[run.js] Starting results viewer...\n');
		spawn('pnpm', ['exec', 'vite'], {
			stdio: 'inherit',
			cwd: __dirname,
		});
	} else {
		console.log('[run.js] Done. Run "pnpm --filter benches-micro dev" to view results later.');
		process.exit(0);
	}
}
