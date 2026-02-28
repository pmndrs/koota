import type { SavedResult } from './store.ts';

const RESET = '\x1b[0m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';

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

export function compare(baseline: SavedResult, candidate: SavedResult, threshold: number): void {
	// Hardware mismatch warning.
	const hw1 = baseline.hardware;
	const hw2 = candidate.hardware;
	if (hw1.cpu !== hw2.cpu || hw1.arch !== hw2.arch || hw1.runtime !== hw2.runtime) {
		console.log(`\n${YELLOW}⚠ Hardware mismatch${RESET}`);
		if (hw1.cpu !== hw2.cpu) console.log(`  ${DIM}CPU: ${hw1.cpu} vs ${hw2.cpu}${RESET}`);
		if (hw1.arch !== hw2.arch) console.log(`  ${DIM}arch: ${hw1.arch} vs ${hw2.arch}${RESET}`);
		if (hw1.runtime !== hw2.runtime) console.log(`  ${DIM}runtime: ${hw1.runtime} vs ${hw2.runtime}${RESET}`);
	}

	console.log(`\n${BOLD}Comparing "${candidate.name}" vs baseline "${baseline.name}"${RESET}\n`);

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

	// Group output by file then group alias.
	let lastFile = '';
	let lastGroup = '';

	for (const m of matched) {
		if (m.key.file !== lastFile) {
			lastFile = m.key.file;
			lastGroup = '';
			console.log(`  ${CYAN}${m.key.file}${RESET}`);
		}
		if (m.key.group !== lastGroup) {
			lastGroup = m.key.group;
			if (lastGroup) console.log(`  ${DIM}${lastGroup}${RESET}`);
		}

		const pct = m.delta * 100;
		const sign = pct > 0 ? '+' : '';
		const pctStr = `${sign}${pct.toFixed(1)}%`;

		let color: string;
		let verdict: string;
		if (Math.abs(m.delta) <= threshold) {
			color = DIM;
			verdict = 'neutral';
		} else if (m.delta < 0) {
			color = GREEN;
			verdict = 'faster';
		} else {
			color = RED;
			verdict = 'slower';
		}

		const name = (m.key.name || m.key.group || 'anonymous').padEnd(32);
		const from = formatTime(m.baselineAvg).padStart(10);
		const to = formatTime(m.candidateAvg).padStart(10);

		console.log(`    ${name} ${from} -> ${to}  ${color}${pctStr.padStart(7)}  (${verdict})${RESET}`);
	}

	if (unmatched.length > 0) {
		console.log(`\n  ${YELLOW}New (not in baseline):${RESET}`);
		for (const u of unmatched) {
			const label = u.group ? `${u.group} > ${u.name || 'anonymous'}` : (u.name || 'anonymous');
			console.log(`    ${DIM}${label}${RESET}`);
		}
	}

	// Summary.
	const faster = matched.filter((m) => m.delta < -threshold).length;
	const slower = matched.filter((m) => m.delta > threshold).length;
	const neutral = matched.length - faster - slower;

	console.log('');
	const parts: string[] = [];
	if (faster > 0) parts.push(`${GREEN}${faster} faster${RESET}`);
	if (slower > 0) parts.push(`${RED}${slower} slower${RESET}`);
	if (neutral > 0) parts.push(`${DIM}${neutral} neutral${RESET}`);
	console.log(`  ${parts.join('  ')}  ${DIM}(threshold: ±${(threshold * 100).toFixed(0)}%)${RESET}`);
	console.log('');
}
