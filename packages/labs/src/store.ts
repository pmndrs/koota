import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export interface HardwareInfo {
	cpu: string | null;
	arch: string | null;
	runtime: string | null;
	freq: number;
}

export interface BenchmarkStats {
	stats?: {
		avg: number;
		min: number;
		max: number;
		p75: number;
		p99: number;
		p999: number;
		samples: number[];
		noisy?: boolean;
		gc?: { avg: number; min: number; max: number; total: number };
	};
}

export interface WorkerBenchmarkRun extends BenchmarkStats {
	name: string;
	args: Record<string, any>;
	error?: unknown;
}

export interface WorkerBenchmarkTrial {
	alias: string;
	baseline: boolean;
	runs: WorkerBenchmarkRun[];
	groupName?: string;
}

export interface SavedBenchmarkTrial extends BenchmarkStats {
	alias: string;
	baseline: boolean;
	groupName?: string;
	error?: unknown;
}

export interface WorkerResult {
	context: {
		cpu: { freq: number; name: string | null };
		arch: string | null;
		runtime: string | null;
	};
	benchmarks: WorkerBenchmarkTrial[];
	environment?: { preFreq: number; postFreq: number };
}

export interface SavedFile {
	file: string;
	benchmarks: SavedBenchmarkTrial[];
}

export interface FreqSample {
	file: string;
	preFreq: number;
	runFreq: number;
	postFreq: number;
}

export interface SavedResult {
	name: string;
	description?: string;
	timestamp: string;
	hardware: HardwareInfo;
	files: SavedFile[];
	environment?: { freqs: FreqSample[] };
}

/** Returns true if the CPU clock was stable during the run (drift ≤ threshold). */
export function isEnvironmentStable(result: SavedResult, threshold = 0.05): boolean {
	const freqs = result.environment?.freqs ?? [];
	if (freqs.length === 0) return true; // no freq data = legacy result, assume stable
	const all = freqs.flatMap((s) => [s.preFreq, s.runFreq, s.postFreq]);
	const min = Math.min(...all);
	const max = Math.max(...all);
	return (max - min) / ((max + min) / 2) <= threshold;
}

export function getLabsDir(configDir: string, resultsDir: string): string {
	return join(configDir, resultsDir);
}

export function getResultsDir(labsDir: string): string {
	return join(labsDir, 'results');
}

export function saveResult(labsDir: string, result: SavedResult): void {
	const dir = getResultsDir(labsDir);
	mkdirSync(dir, { recursive: true });
	writeFileSync(join(dir, `${result.name}.json`), JSON.stringify(result, null, 2));
}

export function loadResult(labsDir: string, name: string): SavedResult {
	const file = join(getResultsDir(labsDir), `${name}.json`);
	if (!existsSync(file)) throw new Error(`No saved result named "${name}"`);
	return JSON.parse(readFileSync(file, 'utf-8')) as SavedResult;
}

export function listResults(labsDir: string): SavedResult[] {
	const dir = getResultsDir(labsDir);
	if (!existsSync(dir)) return [];
	return readdirSync(dir)
		.filter((f) => f.endsWith('.json'))
		.map((f) => JSON.parse(readFileSync(join(dir, f), 'utf-8')) as SavedResult)
		.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

export function deleteResult(labsDir: string, name: string): void {
	const file = join(getResultsDir(labsDir), `${name}.json`);
	if (!existsSync(file)) throw new Error(`No saved result named "${name}"`);
	rmSync(file);
	// Clear baseline pointer if it referenced this result.
	const baselineFile = join(labsDir, 'baseline');
	if (existsSync(baselineFile) && readFileSync(baselineFile, 'utf-8').trim() === name) {
		rmSync(baselineFile);
	}
}

export function clearResults(labsDir: string): void {
	if (existsSync(labsDir)) rmSync(labsDir, { recursive: true, force: true });
}

export function setBaseline(labsDir: string, name: string): void {
	const file = join(getResultsDir(labsDir), `${name}.json`);
	if (!existsSync(file)) throw new Error(`No saved result named "${name}"`);
	mkdirSync(labsDir, { recursive: true });
	writeFileSync(join(labsDir, 'baseline'), name);
}

export function getBaseline(labsDir: string): string | undefined {
	const file = join(labsDir, 'baseline');
	if (!existsSync(file)) return undefined;
	return readFileSync(file, 'utf-8').trim() || undefined;
}
