/**
 * Welch's t-test + Cohen's d for benchmark sample comparison.
 * No external dependencies — p-value computed via regularized incomplete beta approximation.
 */

function mean(a: number[]): number {
    return a.reduce((s, v) => s + v, 0) / a.length;
}

function variance(a: number[], m = mean(a)): number {
    return a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1);
}

/**
 * Regularized incomplete beta function I_x(a, b) via continued fraction expansion.
 * Accurate enough for the t-distribution p-value approximation we need.
 */
function incompleteBeta(x: number, a: number, b: number): number {
    if (x <= 0) return 0;
    if (x >= 1) return 1;

    // Use continued fraction representation (Lentz's method)
    const lbeta = lgamma(a) + lgamma(b) - lgamma(a + b);
    const front = Math.exp(Math.log(x) * a + Math.log(1 - x) * b - lbeta) / a;

    // Modified Lentz continued fraction
    const MAXIT = 200;
    const EPS = 3e-7;
    let f = 1;
    let c = 1;
    let d = 1 - ((a + b) * x) / (a + 1);
    if (Math.abs(d) < 1e-30) d = 1e-30;
    d = 1 / d;
    f = d;

    for (let m = 1; m <= MAXIT; m++) {
        // Even step
        let num = (m * (b - m) * x) / ((a + 2 * m - 1) * (a + 2 * m));
        d = 1 + num * d;
        c = 1 + num / c;
        if (Math.abs(d) < 1e-30) d = 1e-30;
        if (Math.abs(c) < 1e-30) c = 1e-30;
        d = 1 / d;
        f *= d * c;

        // Odd step
        num = -((a + m) * (a + b + m) * x) / ((a + 2 * m) * (a + 2 * m + 1));
        d = 1 + num * d;
        c = 1 + num / c;
        if (Math.abs(d) < 1e-30) d = 1e-30;
        if (Math.abs(c) < 1e-30) c = 1e-30;
        d = 1 / d;
        const delta = d * c;
        f *= delta;

        if (Math.abs(delta - 1) < EPS) break;
    }

    return front * f;
}

/** Log-gamma via Lanczos approximation */
function lgamma(z: number): number {
    const g = 7;
    const c = [
        0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
        -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6,
        1.5056327351493116e-7,
    ];
    if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - lgamma(1 - z);
    z -= 1;
    let x = c[0];
    for (let i = 1; i < g + 2; i++) x += c[i] / (z + i);
    const t = z + g + 0.5;
    return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}

/** Two-tailed p-value from t-statistic and Welch-Satterthwaite degrees of freedom */
function tDistPValue(t: number, df: number): number {
    // p = I_{df/(df+t²)}(df/2, 1/2) — regularized incomplete beta relationship to t-dist CDF
    const x = df / (df + t * t);
    return incompleteBeta(x, df / 2, 0.5);
}

export interface WelchResult {
    t: number;
    df: number;
    p: number; // two-tailed
}

/**
 * Welch's t-test: tests whether two independent samples have different means.
 * Does not assume equal variance (unlike Student's t-test).
 */
export function welchTTest(a: number[], b: number[]): WelchResult {
    if (a.length < 2 || b.length < 2) return { t: 0, df: 1, p: 1 };

    const mA = mean(a);
    const mB = mean(b);
    const vA = variance(a, mA);
    const vB = variance(b, mB);
    const seA = vA / a.length;
    const seB = vB / b.length;
    const se = Math.sqrt(seA + seB);

    if (se === 0) return { t: 0, df: 1, p: 1 };

    const t = (mA - mB) / se;
    // Welch-Satterthwaite degrees of freedom
    const df = (seA + seB) ** 2 / (seA ** 2 / (a.length - 1) + seB ** 2 / (b.length - 1));
    const p = tDistPValue(Math.abs(t), df);

    return { t, df, p };
}

/**
 * Cohen's d: standardised effect size.
 * d = (meanB - meanA) / pooled_sd
 * Positive → B is slower, negative → B is faster.
 */
export function cohensD(a: number[], b: number[]): number {
    if (a.length < 2 || b.length < 2) return 0;

    const mA = mean(a);
    const mB = mean(b);
    const vA = variance(a, mA);
    const vB = variance(b, mB);
    const pooledSD = Math.sqrt(
        ((a.length - 1) * vA + (b.length - 1) * vB) / (a.length + b.length - 2)
    );

    if (pooledSD === 0) return 0;
    return (mB - mA) / pooledSD;
}

export type Verdict = 'faster' | 'slower' | 'neutral';

export interface ClassifyOptions {
	/** Welch t-test significance level. @default 0.05 */
	alpha?: number;
	/** Cohen's d effect size threshold. @default 1.0 */
	dThreshold?: number;
	/** Minimum |delta%| to flag a change (noise floor). @default 0.05 (5%) */
	noiseThreshold?: number;
}

const DEFAULTS = { alpha: 0.05, dThreshold: 1.0, noiseThreshold: 0.05 } as const;

/**
 * Classify a pair of sample arrays.
 * All three conditions must be met to declare a change:
 *   1. |delta%| >= noiseThreshold  (practical magnitude)
 *   2. p <= alpha                  (statistical significance)
 *   3. |d| >= dThreshold           (effect size relative to within-run variance)
 */
export function classify(
	baselineSamples: number[],
	candidateSamples: number[],
	delta: number,
	opts?: ClassifyOptions,
): {
	verdict: Verdict;
	p: number;
	d: number;
} {
	const alpha = opts?.alpha ?? DEFAULTS.alpha;
	const dThreshold = opts?.dThreshold ?? DEFAULTS.dThreshold;
	const noiseThreshold = opts?.noiseThreshold ?? DEFAULTS.noiseThreshold;

	const { p } = welchTTest(baselineSamples, candidateSamples);
	const d = cohensD(baselineSamples, candidateSamples);

	let verdict: Verdict = 'neutral';
	if (Math.abs(delta) >= noiseThreshold && p <= alpha && Math.abs(d) >= dThreshold) {
		verdict = d > 0 ? 'slower' : 'faster';
	}

	return { verdict, p, d };
}
