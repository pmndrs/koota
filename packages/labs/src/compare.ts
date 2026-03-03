import type { LabsConfig } from './config.ts';
import { type ClassifyOptions, type Verdict, classify, mad, median } from './stats.ts';
import type { SavedResult } from './store.ts';

const RESET = '\x1b[0m';
const DIM = '\x1b[2m';
const GRAY = '\x1b[38;5;248m';
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

interface IndexEntry {
    median: number;
    samples: number[];
}

interface MatchedBench {
    key: BenchKey;
    baselineMedian: number;
    candidateMedian: number;
    baselineSamples: number[];
    candidateSamples: number[];
    delta: number;
}

type LegacyTrial = {
    stats?: { samples?: number[] };
    runs?: Array<{ stats?: { samples?: number[] } }>;
};

type ComparableTrial = SavedResult['files'][number]['benchmarks'][number] | LegacyTrial;

function trialSamples(trial: ComparableTrial): number[] {
    if (Array.isArray(trial.stats?.samples)) return trial.stats.samples;
    const legacySamples = 'runs' in trial ? trial.runs?.[0]?.stats?.samples : undefined;
    return Array.isArray(legacySamples) ? legacySamples : [];
}

function formatTime(ns: number): string {
    if (ns >= 1_000_000_000) return `${(ns / 1_000_000_000).toFixed(2)}s`;
    if (ns >= 1_000_000) return `${(ns / 1_000_000).toFixed(2)}ms`;
    if (ns >= 1_000) return `${(ns / 1_000).toFixed(2)}µs`;
    return `${ns.toFixed(2)}ns`;
}

function formatPct(delta: number): string {
    const pct = delta * 100;
    const sign = pct > 0 ? '+' : '';
    return `${sign}${pct.toFixed(1)}%`;
}

/** Returns the time string and ±MAD string separately so they can be colored independently. */
function formatTimeMAD(ns: number, samples: number[]): { time: string; sd: string } {
    const m = mad(samples);

    let sdStr: string;
    if (ns >= 1_000_000_000) sdStr = `±${(m / 1_000_000_000).toFixed(2)}`;
    else if (ns >= 1_000_000) sdStr = `±${(m / 1_000_000).toFixed(2)}`;
    else if (ns >= 1_000) sdStr = `±${(m / 1_000).toFixed(1)}`;
    else sdStr = `±${m.toFixed(1)}`;

    return { time: formatTime(ns), sd: sdStr };
}

function verdictStyle(verdict: Verdict): { color: string; symbol: string } {
    if (verdict === 'faster') return { color: GREEN, symbol: '▼' };
    if (verdict === 'slower') return { color: RED, symbol: '▲' };
    return { color: DIM, symbol: '■' };
}

function deltaBar(delta: number, verdict: Verdict, noiseThreshold: number): string {
    const { color } = verdictStyle(verdict);
    const excess = Math.max(0, Math.abs(delta) - noiseThreshold) * 100;
    const filled = verdict === 'neutral' ? 0 : Math.max(1, Math.min(6, Math.round(excess / 3)));
    const blocks = '█'.repeat(filled).padEnd(6, '·');

    if (verdict === 'faster') return `${color}←${blocks}${RESET}`;
    if (verdict === 'slower') return `${color}→${blocks}${RESET}`;
    return `${DIM} ${blocks}${RESET}`;
}

function buildIndex(result: SavedResult): Map<string, IndexEntry> {
    const map = new Map<string, IndexEntry>();
    for (const f of result.files) {
        for (const trial of f.benchmarks) {
            const samples = trialSamples(trial);
            if (samples.length === 0) continue;
            const key = `${f.file}\0${trial.groupName ?? ''}\0${trial.alias}`;
            map.set(key, { median: median(samples), samples });
        }
    }
    return map;
}

export function compare(baseline: SavedResult, candidate: SavedResult, config: LabsConfig): void {
    const opts: ClassifyOptions = {
        alpha: config.alpha,
        dThreshold: config.dThreshold,
        noiseThreshold: config.noiseThreshold,
    };

    console.log(
        `\n${BOLD}${CYAN}━━ compare${RESET} ${DIM}${baseline.name} -> ${candidate.name}${RESET}`
    );

    const hw1 = baseline.hardware;
    const hw2 = candidate.hardware;
    if (hw1.cpu !== hw2.cpu || hw1.arch !== hw2.arch || hw1.runtime !== hw2.runtime) {
        console.log(`${YELLOW}⚠ hardware mismatch — results may not be directly comparable${RESET}`);
        if (hw1.cpu !== hw2.cpu) console.log(`  ${DIM}CPU: ${hw1.cpu} vs ${hw2.cpu}${RESET}`);
        if (hw1.arch !== hw2.arch) console.log(`  ${DIM}arch: ${hw1.arch} vs ${hw2.arch}${RESET}`);
        if (hw1.runtime !== hw2.runtime)
            console.log(`  ${DIM}runtime: ${hw1.runtime} vs ${hw2.runtime}${RESET}`);
    } else {
        console.log(`${DIM}${hw1.cpu ?? 'unknown CPU'}${RESET}`);
    }
    const noisePct = (config.noiseThreshold * 100).toFixed(0);
    console.log(
        `${DIM}Mann-Whitney U  α=${config.alpha}  |d|≥${config.dThreshold}  noise≥${noisePct}%${RESET}\n`
    );

    const baseIndex = buildIndex(baseline);
    const matched: MatchedBench[] = [];
    const unmatched: BenchKey[] = [];

    for (const f of candidate.files) {
        for (const trial of f.benchmarks) {
            const candidateSamples = trialSamples(trial);
            if (candidateSamples.length === 0) continue;
            const key = `${f.file}\0${trial.groupName ?? ''}\0${trial.alias}`;
            const base = baseIndex.get(key);
            if (base === undefined) {
                unmatched.push({
                    file: f.file,
                    group: trial.groupName ?? trial.alias,
                    name: trial.alias,
                });
                continue;
            }
            const candidateMedian = median(candidateSamples);
            const delta = base.median > 0 ? (candidateMedian - base.median) / base.median : 0;
            matched.push({
                key: { file: f.file, group: trial.groupName ?? trial.alias, name: trial.alias },
                baselineMedian: base.median,
                candidateMedian,
                baselineSamples: base.samples,
                candidateSamples,
                delta,
            });
        }
    }

    if (matched.length === 0 && unmatched.length === 0) {
        console.log(`${DIM}No benchmarks to compare${RESET}`);
        return;
    }

    const NAME_MAX = 36;
    const nameCol = Math.min(
        NAME_MAX,
        Math.max(16, ...matched.map((m) => (m.key.name || m.key.group || 'anonymous').length))
    );

    const truncate = (s: string) =>
        s.length > nameCol ? s.slice(0, nameCol - 1) + '…' : s.padEnd(nameCol);

    const TIME_COL = 16; // "35.51µs ±4.2" fits in ~16 chars
    // 4 (symbol+space) + nameCol + 1 + TIME_COL + 1 + TIME_COL + 1 + 7 (delta) + 2 + 8 (trend "←······")
    const totalWidth = 4 + nameCol + 1 + TIME_COL + 1 + TIME_COL + 1 + 7 + 2 + 8;
    const headerName = '    ' + 'bench'.padEnd(nameCol);
    const header = `${GRAY}${headerName} ${'baseline'.padStart(TIME_COL)} ${'candidate'.padStart(TIME_COL)} ${'delta'.padStart(7)}  trend${RESET}`;
    const divider = `${GRAY}${'-'.repeat(totalWidth)}${RESET}`;

    let lastFile = '';
    let lastGroup = '';

    const rows = matched.map((m) => {
        const { verdict, d } = classify(m.baselineSamples, m.candidateSamples, m.delta, opts);
        return { m, verdict, d };
    });

    for (const { m, verdict, d } of rows) {
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

        const { color, symbol } = verdictStyle(verdict);
        const pctStr = formatPct(m.delta);
        const bar = deltaBar(m.delta, verdict, config.noiseThreshold);

        const name = truncate(m.key.name || m.key.group || 'anonymous');
        const bSD = formatTimeMAD(m.baselineMedian, m.baselineSamples);
        const cSD = formatTimeMAD(m.candidateMedian, m.candidateSamples);
        const sdColor = Math.abs(d) < config.dThreshold ? YELLOW : GRAY;

        // Compute padding based on visible widths only (ANSI codes are invisible)
        const fmtTimeSD = (t: { time: string; sd: string }) => {
            const visible = `${t.time} ${t.sd}`;
            const pad = ' '.repeat(Math.max(0, TIME_COL - visible.length));
            return `${pad}${GRAY}${t.time} ${sdColor}${t.sd}${RESET}`;
        };

        console.log(
            `  ${color}${symbol}${RESET} ${WHITE}${name}${RESET} ${fmtTimeSD(bSD)} ${fmtTimeSD(cSD)} ${color}${pctStr.padStart(7)}${RESET}  ${bar}`
        );
    }

    if (unmatched.length > 0) {
        console.log(`\n${YELLOW}new benchmarks (not in baseline)${RESET}`);
        for (const u of unmatched) {
            const label = u.group ? `${u.group} > ${u.name || 'anonymous'}` : u.name || 'anonymous';
            console.log(`  ${DIM}• ${label}${RESET}`);
        }
    }

    const faster = rows.filter((r) => r.verdict === 'faster').length;
    const slower = rows.filter((r) => r.verdict === 'slower').length;
    const neutral = rows.length - faster - slower;

    const parts: string[] = [];
    if (faster > 0) parts.push(`${GREEN}${faster} faster${RESET}`);
    if (slower > 0) parts.push(`${RED}${slower} slower${RESET}`);
    if (neutral > 0) parts.push(`${DIM}${neutral} neutral${RESET}`);
    console.log(`\n${BOLD}summary${RESET}  ${parts.join('  ')}`);
    console.log(`${DIM}matched: ${rows.length}${RESET}`);
    console.log('');
}
