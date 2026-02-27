import { execSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { LabsConfig } from './config.ts';

const RESET = '\x1b[0m';
const DIM = '\x1b[2m';
const BLUE = '\x1b[34m';
const CYAN = '\x1b[36m';

const WORKER = fileURLToPath(new URL('./worker.ts', import.meta.url));

function globBenchFiles(dir: string, pattern: string): string[] {
	const suffix = pattern.replace(/^\*\*\/\*/, '');
	const results: string[] = [];

	function walk(current: string) {
		for (const entry of readdirSync(current, { withFileTypes: true })) {
			const full = join(current, entry.name);
			if (entry.isDirectory()) walk(full);
			else if (entry.isFile() && entry.name.endsWith(suffix)) results.push(full);
		}
	}

	walk(dir);
	return results.sort();
}

async function loadConfig(configPath: string): Promise<LabsConfig> {
	const mod = await import(pathToFileURL(configPath).href);
	return (mod.default ?? mod) as LabsConfig;
}

const CACHE_FILE = join(process.cwd(), 'node_modules', '.cache', 'labs-last.json');

function loadLastSelection(): string[] {
	try {
		return JSON.parse(readFileSync(CACHE_FILE, 'utf-8'));
	} catch {
		return [];
	}
}

function saveSelection(files: string[]) {
	const dir = dirname(CACHE_FILE);
	if (!existsSync(dir)) execSync(`mkdir -p "${dir}"`);
	writeFileSync(CACHE_FILE, JSON.stringify(files));
}

function runBench(file: string, nodeFlags: string[], label: string) {
	console.log(`\n${BLUE}▶ ${label}${RESET} ${DIM}(tsx + v8 flags)${RESET}`);
	execSync(`pnpm dlx tsx ${nodeFlags.join(' ')} "${WORKER}"`, {
		stdio: 'inherit',
		env: { ...process.env, LABS_BENCH_FILE: pathToFileURL(file).href },
	});
}

function error(msg: string): never {
	console.error(`\x1b[31m✖\x1b[0m ${msg}`);
	process.exit(1);
}

export async function runCLI(args: string[]) {
	const cwd = process.cwd();
	const configCandidates = ['labs.config.ts', 'benches/labs.config.ts'].map((p) => resolve(cwd, p));
	const configPath = configCandidates.find(existsSync);
	if (!configPath) error(`labs.config.ts not found (checked: ${configCandidates.join(', ')})`);

	let config: LabsConfig;
	try {
		config = await loadConfig(configPath);
	} catch (err) {
		error(`Failed to load config: ${configPath}\n${err}`);
	}

	const testDir = resolve(dirname(configPath), config.testDir);
	if (!existsSync(testDir)) error(`testDir not found: ${testDir}`);

	const allFiles = globBenchFiles(testDir, config.testMatch);
	if (allFiles.length === 0) error(`No bench files found matching "${config.testMatch}" in ${testDir}`);

	const label = (f: string) => relative(testDir, f).replace(/\\/g, '/');

	// --last: rerun previous selection
	if (args.includes('--last')) {
		const last = loadLastSelection().filter(existsSync);
		if (last.length === 0) error('No previous selection found');
		console.log(`${CYAN}labs${RESET} ${DIM}(replaying last)${RESET}`);
		for (const f of last) runBench(f, config.nodeFlags, label(f));
		return;
	}

	// Non-flag args are partial file name filters (comma or space separated).
	const filters = args
		.filter((a) => !a.startsWith('-'))
		.flatMap((a) => a.split(','))
		.map((s) => s.trim())
		.filter(Boolean);

	let selected: string[];

	if (filters.length > 0) {
		const seen = new Set<string>();
		const missing: string[] = [];
		selected = [];
		for (const token of filters) {
			const match = allFiles.find((f) => label(f).includes(token));
			if (!match) { missing.push(token); continue; }
			if (!seen.has(match)) { seen.add(match); selected.push(match); }
		}
		if (missing.length > 0) {
			error(`No file matching: ${missing.join(', ')}. Available: ${allFiles.map(label).join(', ')}`);
		}
	} else {
		// No filters → run everything, like `playwright test` with no args.
		selected = allFiles;
	}

	saveSelection(selected);
	console.log(`${CYAN}labs${RESET}`);
	for (const f of selected) runBench(f, config.nodeFlags, label(f));
}
