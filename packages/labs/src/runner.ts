import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { LabsConfig } from './config.ts';
import {
	type SavedResult,
	type WorkerResult,
	clearResults,
	deleteResult,
	getLabsDir,
	saveResult,
} from './store.ts';

const RESET = '\x1b[0m';
const DIM = '\x1b[2m';
const BLUE = '\x1b[34m';
const CYAN = '\x1b[36m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';

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
	if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
	writeFileSync(CACHE_FILE, JSON.stringify(files));
}

function runBench(
	file: string,
	nodeFlags: string[],
	label: string,
	tagFilter?: string,
	resultFile?: string,
): void {
	console.log(`\n${BLUE}▶ ${label}${RESET} ${DIM}(tsx + v8 flags)${RESET}`);
	execSync(`pnpm tsx ${nodeFlags.join(' ')} "${WORKER}"`, {
		stdio: 'inherit',
		env: {
			...process.env,
			LABS_BENCH_FILE: pathToFileURL(file).href,
			...(tagFilter ? { LABS_GREP_TAGS: tagFilter } : {}),
			...(resultFile ? { LABS_RESULT_FILE: resultFile } : {}),
		},
	});
}

function fileHasAnyTag(file: string, tags: string[]): boolean {
	if (tags.length === 0) return true;
	const content = readFileSync(file, 'utf-8');
	return tags.some((tag) => content.includes(tag));
}

function error(msg: string): never {
	console.error(`${RED}✖${RESET} ${msg}`);
	process.exit(1);
}

/** Parse a named flag value: --flag value → value, or undefined if flag absent. */
function flagValue(args: string[], flag: string): string | undefined {
	const i = args.indexOf(flag);
	if (i === -1) return undefined;
	const next = args[i + 1];
	if (!next || next.startsWith('-')) return '';
	return next;
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

	const labsDir = getLabsDir(dirname(configPath), config.resultsDir);

	// --clear: wipe all saved results and baseline pointer.
	if (args.includes('--clear')) {
		clearResults(labsDir);
		console.log(`${GREEN}✔${RESET} Cleared all saved results`);
		return;
	}

	// --delete <name>: remove a specific saved result.
	const deleteName = flagValue(args, '--delete');
	if (deleteName !== undefined) {
		if (!deleteName) error('--delete requires a result name');
		try {
			deleteResult(labsDir, deleteName);
			console.log(`${GREEN}✔${RESET} Deleted "${deleteName}"`);
		} catch (e: any) {
			error(e.message);
		}
		return;
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
	// Skip values that follow known flags.
	const FLAG_TAKES_VALUE = new Set(['--save', '--delete', '-m', '--message']);
	const tokens: string[] = [];
	for (let i = 0; i < args.length; i++) {
		const a = args[i];
		if (a.startsWith('-')) {
			if (FLAG_TAKES_VALUE.has(a)) i++; // skip next value
			continue;
		}
		tokens.push(...a.split(/\s+/).filter(Boolean));
	}

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

	// --save <name>: collect results from each worker and persist.
	const saveRaw = flagValue(args, '--save');
	const saveName = saveRaw !== undefined
		? (saveRaw || new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19))
		: undefined;
	const description = flagValue(args, '-m') ?? flagValue(args, '--message');

	if (saveName !== undefined) {

		const tmpDir = join(cwd, 'node_modules', '.cache', 'labs-tmp');
		mkdirSync(tmpDir, { recursive: true });

		const workerOutputs: Array<{ file: string; resultFile: string }> = [];
		for (const f of selected) {
			const resultFile = join(tmpDir, `${basename(f, '.ts')}-${Date.now()}.json`);
			runBench(f, config.nodeFlags, suiteName(f), tagEnv, resultFile);
			workerOutputs.push({ file: f, resultFile });
		}

		// Assemble SavedResult from worker outputs.
		let hardware = { cpu: null as string | null, arch: null as string | null, runtime: null as string | null, freq: 0 };
		const files: SavedResult['files'] = [];
		let hardwareSet = false;

		for (const { file, resultFile } of workerOutputs) {
			if (!existsSync(resultFile)) continue;
			const workerResult: WorkerResult = JSON.parse(readFileSync(resultFile, 'utf-8'));
			rmSync(resultFile); // clean up temp

			if (!hardwareSet) {
				hardware = {
					cpu: workerResult.context.cpu.name,
					arch: workerResult.context.arch,
					runtime: workerResult.context.runtime,
					freq: workerResult.context.cpu.freq,
				};
				hardwareSet = true;
			}

			files.push({ file: suiteName(file), benchmarks: workerResult.benchmarks });
		}

		const result: SavedResult = {
			name: saveName,
			...(description ? { description } : {}),
			timestamp: new Date().toISOString(),
			hardware,
			files,
		};

		saveResult(labsDir, result);
		console.log(`\n${GREEN}✔${RESET} Saved "${saveName}" (${files.length} file${files.length !== 1 ? 's' : ''})`);
	} else {
		for (const f of selected) runBench(f, config.nodeFlags, suiteName(f), tagEnv);
	}
}
