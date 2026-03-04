import type { LabsConfig } from './config.ts';
import { renderDistributions } from './histogram.ts';
import { type ClassifyOptions, type Verdict, classify, median } from './stats.ts';
import { type FreqSample, type SavedResult, isEnvironmentStable } from './store.ts';
import { BOLD, CYAN, DIM, GRAY, GREEN, RED, RESET, WHITE, YELLOW } from './utils/ansi.ts';
import { formatDelta, formatP, formatTime } from './utils/format.ts';

// ─── Check infrastructure ────────────────────────────────────────────────────

type CheckResult = { ok: true } | { ok: false; reason: string };

type EnvironmentCheck = (baseline: SavedResult, candidate: SavedResult) => CheckResult;

interface BenchData {
    samples: number[];
    noisy: boolean;
}

type BenchCheck = (baseline: BenchData, candidate: BenchData) => CheckResult;

// ─── Environment checks ──────────────────────────────────────────────────────

const MIN_SAMPLES = 20;

/** Max relative difference between the two runs' median clock speeds to consider them comparable. */
const CLOCK_COMPARE_THRESHOLD = 0.05;

function medianFreq(freqs: FreqSample[]): number {
    if (freqs.length === 0) return 0;
    const all = freqs.flatMap((s) => [s.preFreq, s.runFreq, s.postFreq]);
    return median(all);
}

export const checkHardwareMatch: EnvironmentCheck = (baseline, candidate) => {
    const hw1 = baseline.hardware;
    const hw2 = candidate.hardware;
    const mismatches: string[] = [];
    if (hw1.cpu !== hw2.cpu) mismatches.push(`CPU: "${hw1.cpu}" vs "${hw2.cpu}"`);
    if (hw1.arch !== hw2.arch) mismatches.push(`arch: ${hw1.arch} vs ${hw2.arch}`);
    if (hw1.runtime !== hw2.runtime) mismatches.push(`runtime: ${hw1.runtime} vs ${hw2.runtime}`);
    if (mismatches.length > 0) return { ok: false, reason: mismatches.join(', ') };
    return { ok: true };
};

function freqDrift(freqs: FreqSample[]): number {
    if (freqs.length === 0) return 0;
    const all = freqs.flatMap((s) => [s.preFreq, s.runFreq, s.postFreq]);
    const min = Math.min(...all);
    const max = Math.max(...all);
    return (max - min) / ((max + min) / 2);
}

export const checkClockStability: EnvironmentCheck = (baseline, candidate) => {
    const bFreqs = baseline.environment?.freqs ?? [];
    const cFreqs = candidate.environment?.freqs ?? [];

    if (bFreqs.length === 0 && cFreqs.length === 0) return { ok: true };

    if (!isEnvironmentStable(baseline)) {
        const drift = freqDrift(bFreqs);
        return {
            ok: false,
            reason: `baseline CPU was unstable during the run (${(drift * 100).toFixed(1)}% clock drift — disable turbo and fix the governor for a stable benchmark environment)`,
        };
    }
    if (!isEnvironmentStable(candidate)) {
        const drift = freqDrift(cFreqs);
        return {
            ok: false,
            reason: `candidate CPU was unstable during the run (${(drift * 100).toFixed(1)}% clock drift — disable turbo and fix the governor for a stable benchmark environment)`,
        };
    }

    if (bFreqs.length > 0 && cFreqs.length > 0) {
        const bMed = medianFreq(bFreqs);
        const cMed = medianFreq(cFreqs);
        if (bMed > 0 && cMed > 0) {
            const diff = Math.abs(bMed - cMed) / ((bMed + cMed) / 2);
            if (diff > CLOCK_COMPARE_THRESHOLD) {
                return {
                    ok: false,
                    reason: `CPU clock speeds differ between runs (${bMed.toFixed(2)} GHz vs ${cMed.toFixed(2)} GHz — ${(diff * 100).toFixed(1)}% apart)`,
                };
            }
        }
    }

    return { ok: true };
};

/** All environment checks in order. Any failure blocks the entire comparison. */
export const ENVIRONMENT_CHECKS: EnvironmentCheck[] = [checkHardwareMatch, checkClockStability];

// ─── Per-bench checks ────────────────────────────────────────────────────────

export const checkNotNoisy: BenchCheck = (baseline, candidate) => {
    if (baseline.noisy && candidate.noisy)
        return { ok: false, reason: 'both runs did not converge during sampling' };
    if (baseline.noisy) return { ok: false, reason: 'baseline did not converge during sampling' };
    if (candidate.noisy) return { ok: false, reason: 'candidate did not converge during sampling' };
    return { ok: true };
};

export const checkMinSamples: BenchCheck = (baseline, candidate) => {
    if (baseline.samples.length < MIN_SAMPLES && candidate.samples.length < MIN_SAMPLES) {
        return {
            ok: false,
            reason: `too few samples (baseline: ${baseline.samples.length}, candidate: ${candidate.samples.length}; need ≥${MIN_SAMPLES})`,
        };
    }
    if (baseline.samples.length < MIN_SAMPLES) {
        return {
            ok: false,
            reason: `baseline has too few samples (${baseline.samples.length}; need ≥${MIN_SAMPLES})`,
        };
    }
    if (candidate.samples.length < MIN_SAMPLES) {
        return {
            ok: false,
            reason: `candidate has too few samples (${candidate.samples.length}; need ≥${MIN_SAMPLES})`,
        };
    }
    return { ok: true };
};

/** All per-bench checks in order. Any failure skips that bench with a reason. */
export const BENCH_CHECKS: BenchCheck[] = [checkNotNoisy, checkMinSamples];

// ─── Data types ──────────────────────────────────────────────────────────────

export interface BenchKey {
    file: string;
    group: string;
    name: string;
}

export interface EligibleBench {
    kind: 'eligible';
    key: BenchKey;
    baselineP50: number;
    candidateP50: number;
    baselineSamples: number[];
    candidateSamples: number[];
    deltaP50: number;
    deltaP99: number;
    p: number;
    verdict: Verdict;
}

export interface SkippedBench {
    kind: 'skipped';
    key: BenchKey;
    reason: string;
}

export interface MissingBench {
    kind: 'missing';
    key: BenchKey;
    presentIn: 'baseline' | 'candidate';
}

export type BenchResult = EligibleBench | SkippedBench | MissingBench;

export interface CompareResult {
    baselineName: string;
    candidateName: string;
    hardware: SavedResult['hardware'];
    environmentFailures: string[];
    benches: BenchResult[];
}

// ─── Legacy trial helpers ────────────────────────────────────────────────────

type LegacyTrial = {
    stats?: { samples?: number[]; noisy?: boolean; p99?: number };
    runs?: Array<{ stats?: { samples?: number[]; noisy?: boolean; p99?: number } }>;
};

type ComparableTrial = SavedResult['files'][number]['benchmarks'][number] | LegacyTrial;

function trialSamples(trial: ComparableTrial): number[] {
    if (Array.isArray(trial.stats?.samples)) return trial.stats.samples;
    const legacySamples = 'runs' in trial ? trial.runs?.[0]?.stats?.samples : undefined;
    return Array.isArray(legacySamples) ? legacySamples : [];
}

function trialP99(trial: ComparableTrial): number {
    if (trial.stats?.p99 !== undefined) return trial.stats.p99;
    if ('runs' in trial) return trial.runs?.[0]?.stats?.p99 ?? 0;
    return 0;
}

function trialNoisy(trial: ComparableTrial): boolean {
    if (trial.stats?.noisy) return true;
    if ('runs' in trial) return !!(trial.runs?.[0]?.stats as any)?.noisy;
    return false;
}

// ─── Index helpers ───────────────────────────────────────────────────────────

interface IndexEntry {
    median: number;
    p99: number;
    samples: number[];
    noisy: boolean;
}

function buildIndex(result: SavedResult): Map<string, IndexEntry> {
    const map = new Map<string, IndexEntry>();
    for (const f of result.files) {
        for (const trial of f.benchmarks) {
            const key = `${f.file}\0${trial.groupName ?? ''}\0${trial.alias}`;
            const samples = trialSamples(trial);
            map.set(key, {
                median: samples.length > 0 ? median(samples) : 0,
                p99: trialP99(trial),
                samples,
                noisy: trialNoisy(trial),
            });
        }
    }
    return map;
}

function trialKey(file: string, trial: SavedResult['files'][number]['benchmarks'][number]): string {
    return `${file}\0${trial.groupName ?? ''}\0${trial.alias}`;
}

function benchKey(file: string, trial: SavedResult['files'][number]['benchmarks'][number]): BenchKey {
    return { file, group: trial.groupName ?? trial.alias, name: trial.alias };
}

// ─── Core comparison ─────────────────────────────────────────────────────────

export function compare(
    baseline: SavedResult,
    candidate: SavedResult,
    config: LabsConfig
): CompareResult {
    const opts: ClassifyOptions = { alpha: config.alpha };

    const environmentFailures: string[] = [];
    for (const check of ENVIRONMENT_CHECKS) {
        const result = check(baseline, candidate);
        if (!result.ok) environmentFailures.push(result.reason);
    }

    const benches: BenchResult[] = [];

    if (environmentFailures.length > 0) {
        return {
            baselineName: baseline.name,
            candidateName: candidate.name,
            hardware: baseline.hardware,
            environmentFailures,
            benches,
        };
    }

    const baseIndex = buildIndex(baseline);
    const candidateIndex = buildIndex(candidate);

    for (const [key] of baseIndex) {
        if (!candidateIndex.has(key)) {
            const parts = key.split('\0');
            benches.push({
                kind: 'missing',
                key: { file: parts[0], group: parts[1] || parts[2], name: parts[2] },
                presentIn: 'baseline',
            });
        }
    }

    for (const f of candidate.files) {
        for (const trial of f.benchmarks) {
            const key = trialKey(f.file, trial);
            const key_ = benchKey(f.file, trial);
            const base = baseIndex.get(key);

            if (base === undefined) {
                benches.push({ kind: 'missing', key: key_, presentIn: 'candidate' });
                continue;
            }

            const candidateSamples = trialSamples(trial);
            const candidateNoisy = trialNoisy(trial);
            const benchData = {
                baseline: { samples: base.samples, noisy: base.noisy },
                candidate: { samples: candidateSamples, noisy: candidateNoisy },
            };

            let skipReason: string | undefined;
            for (const check of BENCH_CHECKS) {
                const result = check(benchData.baseline, benchData.candidate);
                if (!result.ok) {
                    skipReason = result.reason;
                    break;
                }
            }

            if (skipReason !== undefined) {
                benches.push({ kind: 'skipped', key: key_, reason: skipReason });
                continue;
            }

            const candidateMedian = median(candidateSamples);
            const candidateP99 = trialP99(trial);
            const deltaP50 = base.median > 0 ? (candidateMedian - base.median) / base.median : 0;
            const deltaP99 = base.p99 > 0 ? (candidateP99 - base.p99) / base.p99 : 0;
            const { verdict, p } = classify(base.samples, candidateSamples, opts);

            benches.push({
                kind: 'eligible',
                key: key_,
                baselineP50: base.median,
                candidateP50: candidateMedian,
                baselineSamples: base.samples,
                candidateSamples,
                deltaP50,
                deltaP99,
                p,
                verdict,
            });
        }
    }

    return {
        baselineName: baseline.name,
        candidateName: candidate.name,
        hardware: baseline.hardware,
        environmentFailures,
        benches,
    };
}

// ─── Report formatting ───────────────────────────────────────────────────────

function deltaColor(delta: number, significant: boolean): string {
    if (!significant) return DIM;
    return delta < 0 ? GREEN : delta > 0 ? RED : DIM;
}

function verdictStyle(verdict: Verdict): { color: string; symbol: string } {
    if (verdict === 'faster') return { color: GREEN, symbol: '▲' };
    if (verdict === 'slower') return { color: RED, symbol: '▼' };
    return { color: GRAY, symbol: '■' };
}

// ─── Report ──────────────────────────────────────────────────────────────────

export function printCompareReport(result: CompareResult, config: LabsConfig): void {
    console.log(
        `\n${BOLD}${CYAN}━━ compare${RESET} ${DIM}${result.baselineName} -> ${result.candidateName}${RESET}`
    );
    console.log(`${DIM}${result.hardware.cpu ?? 'unknown CPU'}${RESET}`);
    console.log(`${DIM}Mann-Whitney U  α=${config.alpha}${RESET}\n`);

    if (result.environmentFailures.length > 0) {
        console.log(`${RED}✖ cannot compare — environment check failed${RESET}`);
        for (const reason of result.environmentFailures) {
            console.log(`  ${DIM}· ${reason}${RESET}`);
        }
        console.log('');
        return;
    }

    const eligible = result.benches.filter((b): b is EligibleBench => b.kind === 'eligible');
    const skipped = result.benches.filter((b): b is SkippedBench => b.kind === 'skipped');
    const baselineOnly = result.benches.filter(
        (b): b is MissingBench => b.kind === 'missing' && b.presentIn === 'baseline'
    );
    const candidateOnly = result.benches.filter(
        (b): b is MissingBench => b.kind === 'missing' && b.presentIn === 'candidate'
    );

    if (eligible.length === 0 && skipped.length === 0 && candidateOnly.length === 0) {
        console.log(`${DIM}No benchmarks to compare${RESET}`);
        return;
    }

    // ── Column widths ────────────────────────────────────────────────────────

    const NAME_MAX = 36;
    const nameCol = eligible.length > 0
        ? Math.min(NAME_MAX, Math.max(16, ...eligible.map((b) => (b.key.name || b.key.group || 'anonymous').length)))
        : 16;

    const TIME_COL = 10;
    const DELTA_COL = 7;
    const P_COL = 5;

    const truncate = (s: string) =>
        s.length > nameCol ? s.slice(0, nameCol - 1) + '…' : s.padEnd(nameCol);

    // ── Eligible bench table ─────────────────────────────────────────────────

    if (eligible.length > 0) {
        const totalWidth = 4 + nameCol + 1 + TIME_COL + 1 + TIME_COL + 1 + DELTA_COL + 1 + DELTA_COL + 1 + P_COL;
        const header =
            `${GRAY}${'  ' + 'bench'.padEnd(nameCol + 2)}` +
            ` ${'baseline'.padStart(TIME_COL)}` +
            ` ${'candidate'.padStart(TIME_COL)}` +
            ` ${'Δp50'.padStart(DELTA_COL)}` +
            ` ${'Δp99'.padStart(DELTA_COL)}` +
            ` ${'p'.padStart(P_COL)}` +
            `${RESET}`;
        const divider = `${GRAY}${'-'.repeat(totalWidth)}${RESET}`;

        let lastFile = '';
        let lastGroup = '';

        for (const bench of eligible) {
            if (bench.key.file !== lastFile) {
                if (lastFile) console.log('');
                lastFile = bench.key.file;
                lastGroup = '';
                console.log(`${BOLD}${CYAN}${bench.key.file}${RESET}`);
                console.log(header);
                console.log(divider);
            }
            if (bench.key.group !== lastGroup) {
                lastGroup = bench.key.group;
                if (lastGroup && lastGroup !== bench.key.name)
                    console.log(`  ${DIM}${lastGroup}${RESET}`);
            }

            const sig = bench.p <= config.alpha;
            const { color, symbol } = verdictStyle(bench.verdict);
            const rawName = bench.key.name || bench.key.group || 'anonymous';
            const name = truncate(rawName);
            const dp50Color = bench.verdict === 'faster' ? GREEN
                : bench.verdict === 'slower' ? RED
                : DIM;
            const dp99Color = deltaColor(bench.deltaP99, sig);
            const pColor = sig ? WHITE : DIM;

            console.log(
                `  ${color}${symbol}${RESET} ${WHITE}${name}${RESET}` +
                ` ${GRAY}${formatTime(bench.baselineP50).padStart(TIME_COL)}${RESET}` +
                ` ${GRAY}${formatTime(bench.candidateP50).padStart(TIME_COL)}${RESET}` +
                ` ${dp50Color}${formatDelta(bench.deltaP50).padStart(DELTA_COL)}${RESET}` +
                ` ${dp99Color}${formatDelta(bench.deltaP99).padStart(DELTA_COL)}${RESET}` +
                ` ${pColor}${formatP(bench.p).padStart(P_COL)}${RESET}`
            );

            const dist = renderDistributions(bench.baselineSamples, bench.candidateSamples, TIME_COL);
            console.log(
                `${' '.repeat(4 + nameCol)} ${dist.baseline} ${dist.candidate}`
            );
            console.log('');
        }
    }

    // ── Skipped benches ──────────────────────────────────────────────────────

    if (skipped.length > 0) {
        console.log(`\n${YELLOW}skipped (${skipped.length})${RESET}`);
        for (const b of skipped) {
            const label = truncate(b.key.name || b.key.group || 'anonymous');
            console.log(`  ${DIM}· ${label}${RESET}  ${YELLOW}${b.reason}${RESET}`);
        }
    }

    // ── Missing benches ──────────────────────────────────────────────────────

    if (candidateOnly.length > 0) {
        console.log(`\n${DIM}new in candidate (not in baseline)${RESET}`);
        for (const b of candidateOnly) {
            const label =
                b.key.group && b.key.group !== b.key.name
                    ? `${b.key.group} > ${b.key.name || 'anonymous'}`
                    : b.key.name || 'anonymous';
            console.log(`  ${DIM}· ${label}${RESET}`);
        }
    }

    if (baselineOnly.length > 0) {
        console.log(`\n${DIM}removed from candidate (only in baseline)${RESET}`);
        for (const b of baselineOnly) {
            const label =
                b.key.group && b.key.group !== b.key.name
                    ? `${b.key.group} > ${b.key.name || 'anonymous'}`
                    : b.key.name || 'anonymous';
            console.log(`  ${DIM}· ${label}${RESET}`);
        }
    }

    // ── Summary ──────────────────────────────────────────────────────────────

    const faster = eligible.filter((b) => b.verdict === 'faster').length;
    const slower = eligible.filter((b) => b.verdict === 'slower').length;
    const neutral = eligible.length - faster - slower;

    const parts: string[] = [];
    if (faster > 0) parts.push(`${GREEN}${faster} faster${RESET}`);
    if (slower > 0) parts.push(`${RED}${slower} slower${RESET}`);
    if (neutral > 0) parts.push(`${DIM}${neutral} neutral${RESET}`);
    if (skipped.length > 0) parts.push(`${YELLOW}${skipped.length} skipped${RESET}`);

    console.log(`\n${BOLD}summary${RESET}  ${parts.join('  ')}`);
    console.log(`${DIM}compared: ${eligible.length}  matched: ${result.benches.length}${RESET}`);
    console.log('');
}
