import { execSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
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

function runBench(file: string, nodeFlags: string[], label: string, tagFilter?: string) {
	console.log(`\n${BLUE}▶ ${label}${RESET} ${DIM}(tsx + v8 flags)${RESET}`);
	execSync(`pnpm tsx ${nodeFlags.join(' ')} "${WORKER}"`, {
		stdio: 'inherit',
		env: {
			...process.env,
			LABS_BENCH_FILE: pathToFileURL(file).href,
			...(tagFilter ? { LABS_GREP_TAGS: tagFilter } : {}),
		},
	});
}

function fileHasAnyTag(file: string, tags: string[]): boolean {
	if (tags.length === 0) return true;
	const content = readFileSync(file, 'utf-8');
	return tags.some((tag) => content.includes(tag));
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

	const benchDir = resolve(dirname(configPath), config.benchDir);
	if (!existsSync(benchDir)) error(`benchDir not found: ${benchDir}`);

	const allFiles = globBenchFiles(benchDir, config.benchMatch);
	if (allFiles.length === 0) error(`No bench files found matching "${config.benchMatch}" in ${benchDir}`);

	const label = (f: string) => relative(benchDir, f).replace(/\\/g, '/');
	const suiteName = (f: string) => basename(f);

	// --last: rerun previous selection
	if (args.includes('--last')) {
		const last = loadLastSelection().filter(existsSync);
		if (last.length === 0) error('No previous selection found');
		console.log(`${CYAN}labs${RESET} ${DIM}(replaying last)${RESET}`);
			for (const f of last) runBench(f, config.nodeFlags, suiteName(f));
		return;
	}

	// Split all non-flag args into tokens. @-prefixed tokens are tag filters, the rest are name filters.
	const tokens = args
		.filter((a) => !a.startsWith('-'))
		.flatMap((a) => a.split(/\s+/))
		.filter(Boolean);

	const tagFilters = tokens.filter((t) => t.startsWith('@'));
	const nameFilters = tokens.filter((t) => !t.startsWith('@'));

	let selected: string[];

	if (nameFilters.length > 0) {
		const normalize = (s: string) => s.toLowerCase().replace(/[-\s_]+/g, '');
		const seen = new Set<string>();
		const missing: string[] = [];
		selected = [];
		for (const token of nameFilters) {
			const norm = normalize(token);
			const match = allFiles.find((f) => normalize(label(f)).includes(norm));
			if (!match) { missing.push(token); continue; }
			if (!seen.has(match)) { seen.add(match); selected.push(match); }
		}
		if (missing.length > 0) {
			error(`No file matching: ${missing.join(', ')}. Available: ${allFiles.map(label).join(', ')}`);
		}
	} else {
		selected = allFiles;
	}

	if (tagFilters.length > 0) {
		selected = selected.filter((file) => fileHasAnyTag(file, tagFilters));
	}
	if (selected.length === 0) {
		error(`No bench files matched the provided filters. Available: ${allFiles.map(label).join(', ')}`);
	}

	saveSelection(selected);
	console.log(`${CYAN}labs${RESET}`);
	const tagEnv = tagFilters.length > 0 ? tagFilters.join(',') : undefined;
	for (const f of selected) runBench(f, config.nodeFlags, suiteName(f), tagEnv);
}
