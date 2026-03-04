/**
 * Non-parametric benchmark sample comparison.
 * Mann-Whitney U test — robust to GC-induced outliers and
 * non-normal distributions. No external dependencies.
 */

export function median(a: number[]): number {
    if (a.length === 0) return 0;
    const s = a.slice().sort((x, y) => x - y);
    const mid = s.length >> 1;
    return s.length % 2 === 1 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Median absolute deviation — robust spread metric paired with median. */
export function mad(a: number[]): number {
    if (a.length < 2) return 0;
    const m = median(a);
    return median(a.map((v) => Math.abs(v - m)));
}

/**
 * Mann-Whitney U test (two-tailed).
 * Ranks all combined samples, sums ranks for group A, derives U and p-value
 * via normal approximation. Accurate for n > ~20 (mitata yields 50+ samples).
 *
 * Returns { U, z, p } where p is the two-tailed p-value.
 */
export function mannWhitneyU(a: number[], b: number[]): { U: number; z: number; p: number } {
    const n1 = a.length;
    const n2 = b.length;
    if (n1 === 0 || n2 === 0) return { U: 0, z: 0, p: 1 };

    // Merge and rank (average ranks for ties)
    const combined = [...a.map((v) => ({ v, group: 0 })), ...b.map((v) => ({ v, group: 1 }))].sort(
        (x, y) => x.v - y.v
    );

    const ranks = new Float64Array(combined.length);
    let i = 0;
    while (i < combined.length) {
        let j = i;
        while (j < combined.length - 1 && combined[j + 1].v === combined[i].v) j++;
        const avgRank = (i + j) / 2 + 1; // 1-indexed
        for (let k = i; k <= j; k++) ranks[k] = avgRank;
        i = j + 1;
    }

    let R1 = 0;
    for (let k = 0; k < combined.length; k++) {
        if (combined[k].group === 0) R1 += ranks[k];
    }

    const U1 = R1 - (n1 * (n1 + 1)) / 2;
    const U = Math.min(U1, n1 * n2 - U1); // use smaller U for the approximation

    const mean = (n1 * n2) / 2;
    const sd = Math.sqrt((n1 * n2 * (n1 + n2 + 1)) / 12);
    const z = sd === 0 ? 0 : (U - mean) / sd;

    // Two-tailed p-value via erfc: p = erfc(|z| / sqrt(2))
    const p = erfc(Math.abs(z) / Math.SQRT2);

    return { U: U1, z, p };
}

/** Complementary error function approximation (Abramowitz & Stegun 7.1.26). */
function erfc(x: number): number {
    if (x < 0) return 2 - erfc(-x);
    const t = 1 / (1 + 0.3275911 * x);
    const poly =
        t *
        (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
    return poly * Math.exp(-(x * x));
}

export type Verdict = 'faster' | 'slower' | 'neutral';

export interface ClassifyOptions {
    /** Mann-Whitney U two-tailed significance level. @default 0.05 */
    alpha?: number;
}

/**
 * Classify a pair of sample arrays.
 * If `p <= alpha`, the p50 ratio direction determines faster vs slower.
 * Otherwise the result is neutral.
 */
export function classify(
    baselineSamples: number[],
    candidateSamples: number[],
    opts?: ClassifyOptions
): {
    verdict: Verdict;
    p: number;
} {
    const alpha = opts?.alpha ?? 0.05;
    const { p } = mannWhitneyU(baselineSamples, candidateSamples);

    let verdict: Verdict = 'neutral';
    if (p <= alpha) {
        verdict = median(candidateSamples) > median(baselineSamples) ? 'slower' : 'faster';
    }

    return { verdict, p };
}
