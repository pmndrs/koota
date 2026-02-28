import type { SavedResult } from './store.ts';

const RESET = '\x1b[0m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const WHITE = '\x1b[37m';

interface BenchKey {
	file: string;
	group: string;
	name: string;
}

interface MatchedBench {
	key: BenchKey;
	baselineAvg: number;
	candidateAvg: number;
	delta: number;
}

type Verdict = 'faster' | 'slower' | 'neutral';

function formatTime(ns: number): string {
	if (ns >= 1_000_000_000) return `${(ns / 1_000_000_000).toFixed(2)}s`;
	if (ns >= 1_000_000) return `${(ns / 1_000_000).toFixed(2)}ms`;
	if (ns >= 1_000) return `${(ns / 1_000).toFixed(2)}µs`;
	return `${ns.toFixed(2)}ns`;
}

function buildIndex(result: SavedResult): Map<string, number> {
	const map = new Map<string, number>();
	for (const f of result.files) {
		for (const trial of f.benchmarks) {
			for (const run of trial.runs) {
				if (!run.stats) continue;
				const key = `${f.file}\0${trial.groupName ?? ''}\0${trial.alias}\0${run.name}`;
				map.set(key, run.stats.avg);
			}
		}
	}
	return map;
}

function getVerdict(delta: number, threshold: number): Verdict {
	if (Math.abs(delta) <= threshold) return 'neutral';
	return delta < 0 ? 'faster' : 'slower';
}

function verdictStyle(verdict: Verdict): { color: string; symbol: string } {
	if (verdict === 'faster') return { color: GREEN, symbol: '▼' };
	if (verdict === 'slower') return { color: RED, symbol: '▲' };
	return { color: DIM, symbol: '■' };
}

function formatPct(delta: number): string {
	const pct = delta * 100;
	const sign = pct > 0 ? '+' : '';
	return `${sign}${pct.toFixed(1)}%`;
}

function deltaBar(delta: number, threshold: number): string {
	const verdict = getVerdict(delta, threshold);
	const { color } = verdictStyle(verdict);
	const pct = Math.abs(delta) * 100;
	const filled = Math.max(1, Math.min(10, Math.round(pct / 2)));
	const blocks = '█'.repeat(filled).padEnd(10, '·');

	if (verdict === 'faster') return `${color}←${blocks}${RESET}`;
	if (verdict === 'slower') return `${color}→${blocks}${RESET}`;
	return `${DIM}·${blocks}${RESET}`;
}

export function compare(baseline: SavedResult, candidate: SavedResult, threshold: number): void {
	console.log(`\n${BOLD}${CYAN}━━ compare${RESET} ${DIM}${baseline.name} -> ${candidate.name}${RESET}`);

	const hw1 = baseline.hardware;
	const hw2 = candidate.hardware;
	if (hw1.cpu !== hw2.cpu || hw1.arch !== hw2.arch || hw1.runtime !== hw2.runtime) {
		console.log(`${YELLOW}⚠ hardware mismatch — results may not be directly comparable${RESET}`);
		if (hw1.cpu !== hw2.cpu) console.log(`  ${DIM}CPU: ${hw1.cpu} vs ${hw2.cpu}${RESET}`);
		if (hw1.arch !== hw2.arch) console.log(`  ${DIM}arch: ${hw1.arch} vs ${hw2.arch}${RESET}`);
		if (hw1.runtime !== hw2.runtime) console.log(`  ${DIM}runtime: ${hw1.runtime} vs ${hw2.runtime}${RESET}`);
	} else {
		console.log(`${DIM}${hw1.cpu ?? 'unknown CPU'}${RESET}`);
	}
	console.log(`${DIM}threshold: ±${(threshold * 100).toFixed(0)}%${RESET}\n`);

	const baseIndex = buildIndex(baseline);
	const matched: MatchedBench[] = [];
	const unmatched: BenchKey[] = [];

	for (const f of candidate.files) {
		for (const trial of f.benchmarks) {
			for (const run of trial.runs) {
				if (!run.stats) continue;
				const key = `${f.file}\0${trial.groupName ?? ''}\0${trial.alias}\0${run.name}`;
				const baseAvg = baseIndex.get(key);
				if (baseAvg === undefined) {
					unmatched.push({ file: f.file, group: trial.groupName ?? trial.alias, name: run.name });
					continue;
				}
				const delta = (run.stats.avg - baseAvg) / baseAvg;
				matched.push({
					key: { file: f.file, group: trial.groupName ?? trial.alias, name: trial.alias },
					baselineAvg: baseAvg,
					candidateAvg: run.stats.avg,
					delta,
				});
			}
		}
	}

	if (matched.length === 0 && unmatched.length === 0) {
		console.log(`${DIM}No benchmarks to compare${RESET}`);
		return;
	}

	// Compute name column width: longest name, capped at 36, min 16.
	const NAME_MAX = 36;
	const nameCol = Math.min(
		NAME_MAX,
		Math.max(16, ...matched.map((m) => (m.key.name || m.key.group || 'anonymous').length)),
	);

	const truncate = (s: string) =>
		s.length > nameCol ? s.slice(0, nameCol - 1) + '…' : s.padEnd(nameCol);

	// 4-char row prefix ("  ▼ ") must be reflected in the header indent.
	const headerName = '    ' + 'bench'.padEnd(nameCol);
	const header =
		`${DIM}${headerName} ${'baseline'.padStart(10)} ${'candidate'.padStart(10)} ${'delta'.padStart(7)}  trend${RESET}`;
	const divider = `${DIM}${'-'.repeat(nameCol + 48)}${RESET}`;

	let lastFile = '';
	let lastGroup = '';

	for (const m of matched) {
		if (m.key.file !== lastFile) {
			if (lastFile) console.log('');
			lastFile = m.key.file;
			lastGroup = '';
			console.log(`${BOLD}${CYAN}${m.key.file}${RESET}`);
			console.log(header);
			console.log(divider);
		}
		if (m.key.group !== lastGroup) {
			lastGroup = m.key.group;
			if (lastGroup) console.log(`  ${DIM}  ${lastGroup}${RESET}`);
		}

		const verdict = getVerdict(m.delta, threshold);
		const { color, symbol } = verdictStyle(verdict);
		const pctStr = formatPct(m.delta);
		const bar = deltaBar(m.delta, threshold);

		const name = truncate(m.key.name || m.key.group || 'anonymous');
		const from = formatTime(m.baselineAvg).padStart(10);
		const to = formatTime(m.candidateAvg).padStart(10);

		console.log(
			`  ${color}${symbol}${RESET} ${WHITE}${name}${RESET} ${DIM}${from} ${to}${RESET} ${color}${pctStr.padStart(7)}${RESET}  ${bar}`,
		);
	}

	if (unmatched.length > 0) {
		console.log(`\n${YELLOW}new benchmarks (not in baseline)${RESET}`);
		for (const u of unmatched) {
			const label = u.group ? `${u.group} > ${u.name || 'anonymous'}` : (u.name || 'anonymous');
			console.log(`  ${DIM}• ${label}${RESET}`);
		}
	}

	const faster = matched.filter((m) => m.delta < -threshold).length;
	const slower = matched.filter((m) => m.delta > threshold).length;
	const neutral = matched.length - faster - slower;

	const parts: string[] = [];
	if (faster > 0) parts.push(`${GREEN}${faster} faster${RESET}`);
	if (slower > 0) parts.push(`${RED}${slower} slower${RESET}`);
	if (neutral > 0) parts.push(`${DIM}${neutral} neutral${RESET}`);
	console.log(`\n${BOLD}summary${RESET}  ${parts.join('  ')}`);
	console.log(`${DIM}matched: ${matched.length}${RESET}`);
	console.log('');
}
