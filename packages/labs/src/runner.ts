import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { compare } from './compare.ts';
import type { LabsConfig } from './config.ts';
import {
	type SavedResult,
	type WorkerResult,
	clearResults,
	deleteResult,
	getBaseline,
	getLabsDir,
	listResults,
	loadResult,
	saveResult,
	setBaseline,
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

	// Subcommands: first arg is a known keyword — no bench run occurs.
	const subcmd = args[0];
	const subcmdArg = args[1]; // optional positional arg for the subcommand

	if (subcmd === 'list') {
		const results = listResults(labsDir);
		const baseline = getBaseline(labsDir);
		if (results.length === 0) {
			console.log(`${DIM}No saved results${RESET}`);
		} else {
			console.log('');
			for (const r of results) {
				const isBaseline = r.name === baseline;
				const marker = isBaseline ? ` ${CYAN}(baseline)${RESET}` : '';
				const desc = r.description ? ` ${DIM}— ${r.description}${RESET}` : '';
				const date = new Date(r.timestamp).toLocaleString();
				console.log(`  ${isBaseline ? GREEN : BLUE}▶${RESET} ${r.name}${marker}${desc}`);
				console.log(`    ${DIM}${date}  ${r.hardware.cpu ?? 'unknown CPU'}${RESET}`);
			}
			console.log('');
		}
		return;
	}

	if (subcmd === 'clear') {
		clearResults(labsDir);
		console.log(`${GREEN}✔${RESET} Cleared all saved results`);
		return;
	}

	if (subcmd === 'delete') {
		if (!subcmdArg) error('Usage: bench delete <name>');
		try {
			deleteResult(labsDir, subcmdArg);
			console.log(`${GREEN}✔${RESET} Deleted "${subcmdArg}"`);
		} catch (e: any) {
			error(e.message);
		}
		return;
	}

	if (subcmd === 'baseline') {
		if (!subcmdArg) {
			const current = getBaseline(labsDir);
			if (!current) console.log(`${DIM}No baseline set${RESET}`);
			else console.log(`${CYAN}baseline:${RESET} ${current}`);
		} else {
			try {
				setBaseline(labsDir, subcmdArg);
				console.log(`${GREEN}✔${RESET} Baseline set to "${subcmdArg}"`);
			} catch (e: any) {
				error(e.message);
			}
		}
		return;
	}

	if (subcmd === 'compare') {
		const baselineName = getBaseline(labsDir);
		if (!baselineName) error('No baseline set. Run: bench baseline <name>');
		let candidateName: string;
		if (subcmdArg) {
			candidateName = subcmdArg;
		} else {
			const all = listResults(labsDir);
			const candidate = all.filter((r) => r.name !== baselineName).pop();
			if (!candidate) error('No saved result to compare. Save a result first with -s.');
			candidateName = candidate.name;
		}
		try {
			const baseline = loadResult(labsDir, baselineName);
			const candidate = loadResult(labsDir, candidateName);
			compare(baseline, candidate, config);
		} catch (e: any) {
			error(e.message);
		}
		return;
	}

	// `run` subcommand — execute without saving results.
	const shouldSave = subcmd !== 'run';
	const benchArgs = shouldSave ? args : args.slice(1);

	// --runs N overrides config.runs for this invocation.
	const runsRaw = flagValue(benchArgs, '--runs');
	const runs = runsRaw !== undefined ? Math.max(1, parseInt(runsRaw, 10) || 1) : config.runs;

	const benchDir = resolve(dirname(configPath), config.benchDir);
	if (!existsSync(benchDir)) error(`benchDir not found: ${benchDir}`);

	const allFiles = globBenchFiles(benchDir, config.benchMatch);
	if (allFiles.length === 0) error(`No bench files found matching "${config.benchMatch}" in ${benchDir}`);

	const label = (f: string) => relative(benchDir, f).replace(/\\/g, '/');
	const suiteName = (f: string) => basename(f);

	let selected: string[];
	let tagEnv: string | undefined;

	if (benchArgs.includes('--last')) {
		selected = loadLastSelection().filter(existsSync);
		if (selected.length === 0) error('No previous selection found');
		console.log(`${CYAN}labs${RESET} ${DIM}(replaying last)${RESET}`);
	} else {
		// Single positional arg is the filter string (must be quoted on CLI).
		const FLAG_TAKES_VALUE = new Set(['-n', '--name', '-m', '--message', '--runs']);
		let filterArg: string | undefined;
		for (let i = 0; i < benchArgs.length; i++) {
			const a = benchArgs[i];
			if (a.startsWith('-')) {
				if (FLAG_TAKES_VALUE.has(a)) i++;
				continue;
			}
			filterArg = a;
			break;
		}

		const tokens = filterArg ? filterArg.split(/\s+/).filter(Boolean) : [];
		const tagFilters = tokens.filter((t) => t.startsWith('@'));
		const nameFilters = tokens.filter((t) => !t.startsWith('@'));
		tagEnv = tagFilters.length > 0 ? tagFilters.join(',') : undefined;

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
	}

	if (!shouldSave) {
		for (let r = 0; r < runs; r++) {
			for (const f of selected) {
				const roundLabel = runs > 1 ? `${suiteName(f)} [${r + 1}/${runs}]` : suiteName(f);
				runBench(f, config.nodeFlags, roundLabel, tagEnv);
			}
		}
		return;
	}

	// Save path: run workers, collect results, persist.
	const defaultName = () => new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
	const saveName = flagValue(benchArgs, '-n') ?? flagValue(benchArgs, '--name') ?? defaultName();
	const description = flagValue(benchArgs, '-m') ?? flagValue(benchArgs, '--message');
	const setAsBaseline = benchArgs.includes('--baseline') || benchArgs.includes('-b');
	const shouldCompare = benchArgs.includes('--compare') || benchArgs.includes('-c');

	const tmpDir = join(cwd, 'node_modules', '.cache', 'labs-tmp');
	mkdirSync(tmpDir, { recursive: true });

	// Interleaved rounds: [file1, file2, ..., fileN] x runs
	// Each file experiences different thermal states across rounds.
	const workerOutputs: Array<{ file: string; resultFile: string }> = [];
	for (let r = 0; r < runs; r++) {
		for (const f of selected) {
			const roundLabel = runs > 1 ? `${suiteName(f)} [${r + 1}/${runs}]` : suiteName(f);
			const resultFile = join(tmpDir, `${basename(f, '.ts')}-r${r}-${Date.now()}.json`);
			runBench(f, config.nodeFlags, roundLabel, tagEnv, resultFile);
			workerOutputs.push({ file: f, resultFile });
		}
	}

	let hardware = { cpu: null as string | null, arch: null as string | null, runtime: null as string | null, freq: 0 };
	const files: SavedResult['files'] = [];
	let hardwareSet = false;

	// Group outputs by file name, preserving round order.
	const outputsByFile = new Map<string, WorkerResult[]>();
	for (const { file, resultFile } of workerOutputs) {
		if (!existsSync(resultFile)) continue;
		const workerResult: WorkerResult = JSON.parse(readFileSync(resultFile, 'utf-8'));
		rmSync(resultFile);

		if (!hardwareSet) {
			hardware = {
				cpu: workerResult.context.cpu.name,
				arch: workerResult.context.arch,
				runtime: workerResult.context.runtime,
				freq: workerResult.context.cpu.freq,
			};
			hardwareSet = true;
		}

		const key = suiteName(file);
		if (!outputsByFile.has(key)) outputsByFile.set(key, []);
		outputsByFile.get(key)!.push(workerResult);
	}

	// Merge rounds per file: use round 0 as skeleton, concatenate samples from rounds 1..N.
	for (const [fileName, results] of outputsByFile) {
		if (results.length === 1) {
			files.push({ file: fileName, benchmarks: results[0].benchmarks });
			continue;
		}
		// Deep-clone first round to avoid mutating the parsed object in place
		const merged: WorkerResult = JSON.parse(JSON.stringify(results[0]));
		for (const trial of merged.benchmarks) {
			for (const run of trial.runs) {
				if (!run.stats) continue;
				for (let r = 1; r < results.length; r++) {
					const matchTrial = results[r].benchmarks.find(
						(t) => t.alias === trial.alias && t.groupName === trial.groupName,
					);
					const matchRun = matchTrial?.runs.find((mr) => mr.name === run.name);
					if (matchRun?.stats) run.stats.samples.push(...matchRun.stats.samples);
				}
				// Recompute avg over all merged samples
				run.stats.avg = run.stats.samples.reduce((a, b) => a + b, 0) / run.stats.samples.length;
			}
		}
		files.push({ file: fileName, benchmarks: merged.benchmarks });
	}

	const result: SavedResult = {
		name: saveName,
		...(description ? { description } : {}),
		timestamp: new Date().toISOString(),
		hardware,
		files,
	};

	saveResult(labsDir, result);
	const isFirstSave = !getBaseline(labsDir);
	if (setAsBaseline || isFirstSave) setBaseline(labsDir, saveName);
	const baselineNote = (setAsBaseline || isFirstSave) ? ` ${CYAN}(baseline)${RESET}` : '';
	console.log(`\n${GREEN}✔${RESET} Saved "${saveName}"${baselineNote} (${files.length} file${files.length !== 1 ? 's' : ''})`);

	if (shouldCompare) {
		const baselineName = getBaseline(labsDir);
		if (!baselineName) {
			console.log(`\n${DIM}No baseline set — skipping compare. Run: bench baseline <name>${RESET}`);
		} else if (baselineName === saveName) {
			console.log(`\n${DIM}Saved result is the baseline — nothing to compare${RESET}`);
		} else {
			try {
				const baselineResult = loadResult(labsDir, baselineName);
				compare(baselineResult, result, config);
			} catch (e: any) {
				console.log(`\n${RED}✖${RESET} Compare failed: ${e.message}`);
			}
		}
	}
}
