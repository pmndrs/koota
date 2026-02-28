export interface LabsConfig {
	/** Directory to search for bench files, relative to the config file. */
	benchDir: string;
	/** Glob pattern for bench file discovery. @default "**\/*.bench.ts" */
	benchMatch: string;
	/** Node.js CLI flags passed when running each bench worker. */
	nodeFlags: string[];
	/** Directory for saved results and baseline pointer, relative to config file. @default ".labs" */
	resultsDir: string;
	/** Number of times to run each file per save, interleaved. @default 1 */
	runs: number;
	/** Welch t-test significance level. @default 0.05 */
	alpha: number;
	/** Cohen's d effect size threshold. @default 1.0 */
	dThreshold: number;
	/** Minimum |delta%| to flag a change (noise floor). @default 0.05 (5%) */
	noiseThreshold: number;
}

export function defineConfig(config: Partial<LabsConfig> & Pick<LabsConfig, 'benchDir'>): LabsConfig {
	return {
		benchMatch: '**/*.bench.ts',
		nodeFlags: ['--allow-natives-syntax', '--expose-gc'],
		resultsDir: '.labs',
		runs: 1,
		alpha: 0.05,
		dThreshold: 1.0,
		noiseThreshold: 0.05,
		...config,
	};
}
