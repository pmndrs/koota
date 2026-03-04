export interface LabsConfig {
    /** Directory to search for bench files, relative to the config file. */
    benchDir: string;
    /** Glob pattern for bench file discovery. @default "**\/*.bench.ts" */
    benchMatch: string;
    /** Node.js CLI flags passed when running each bench worker. */
    nodeFlags: string[];
    /** Directory for saved results and baseline pointer, relative to config file. @default ".labs" */
    resultsDir: string;
    /** Minimum benchmark CPU time budget in seconds. Scaled internally when GC inner is used. @default 0.642 */
    minCpuTime?: number;
    /** Minimum benchmark sample count. @default 20 */
    minSamples?: number;
    /** Maximum benchmark sample count safety cap. @default 1e9 */
    maxSamples?: number;
    /**
     * Adaptive sampling mode. `true` uses the default CI threshold (2.5%). A number sets a custom
     * threshold (e.g. `0.01` for 1% — stricter, more samples). `false` disables adaptive sampling,
     * reverting to fixed minCpuTime + minSamples stopping. @default true
     */
    adaptive?: boolean | number;
    /** Maximum CPU time budget in seconds for adaptive sampling. If hit before convergence, the benchmark is flagged `noisy`. @default 5 */
    maxCpuTime?: number;
    /** Mann-Whitney U significance level. @default 0.05 */
    alpha: number;
    /** Minimum absolute Δp50 required to flag a verdict. Filters environmental noise on identical code. @default 0.05 */
    minDelta: number;
}

export function defineConfig(config: Partial<LabsConfig> & Pick<LabsConfig, 'benchDir'>): LabsConfig {
    return {
        benchMatch: '**/*.bench.ts',
        nodeFlags: ['--allow-natives-syntax', '--expose-gc'],
        resultsDir: '.labs',
        minSamples: 20,
        maxSamples: 1e9,
        adaptive: true,
        maxCpuTime: 5,
        alpha: 0.05,
        minDelta: 0.05,
        ...config,
    };
}
