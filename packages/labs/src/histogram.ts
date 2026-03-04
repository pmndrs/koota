import { CYAN, MAGENTA, RESET } from './utils/ansi.ts';

const SYMBOLS = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];

function clamp(lo: number, v: number, hi: number): number {
    return v < lo ? lo : v > hi ? hi : v;
}

/** Bin sorted samples into `size` buckets over `[min, max]`. Returns normalized heights [0..1]. */
function binSamples(
    sorted: number[],
    size: number,
    min: number,
    max: number,
    percentile: number
): number[] {
    const bins = Array.from({ length: size }, () => 0);
    if (sorted.length === 0) return bins;

    const offset = (percentile * (sorted.length - 1)) | 0;
    const step = (max - min) / (size - 1);

    if (step === 0) {
        bins[Math.floor(size / 2)] = 1;
        return bins;
    }

    for (let i = 0; i <= offset; i++) {
        const idx = clamp(0, Math.round((sorted[i] - min) / step), size - 1);
        bins[idx]++;
    }

    const peak = Math.max(...bins);
    if (peak === 0) return bins;
    return bins.map((b) => b / peak);
}

function sparkline(heights: number[], color: string): string {
    let s = color;
    for (const h of heights) {
        s += SYMBOLS[clamp(0, Math.round(h * (SYMBOLS.length - 1)), SYMBOLS.length - 1)];
    }
    s += RESET;
    return s;
}

/** Render two sparklines on a shared axis, one per column. Visible width of each = `width`. */
export function renderDistributions(
    baselineSamples: number[],
    candidateSamples: number[],
    width: number
): { baseline: string; candidate: string } {
    const bSorted = baselineSamples.slice().sort((a, b) => a - b);
    const cSorted = candidateSamples.slice().sort((a, b) => a - b);

    const percentile = 0.99;
    const bCutoff = bSorted[((percentile * (bSorted.length - 1)) | 0)] ?? 0;
    const cCutoff = cSorted[((percentile * (cSorted.length - 1)) | 0)] ?? 0;

    const min = Math.min(bSorted[0] ?? 0, cSorted[0] ?? 0);
    const max = Math.max(bCutoff, cCutoff) || 1;

    const bBins = binSamples(bSorted, width, min, max, percentile);
    const cBins = binSamples(cSorted, width, min, max, percentile);

    return {
        baseline: sparkline(bBins, CYAN),
        candidate: sparkline(cBins, MAGENTA),
    };
}
