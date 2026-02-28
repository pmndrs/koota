export interface LabsConfig {
	/** Directory to search for bench files, relative to the config file. */
	benchDir: string;
	/** Glob pattern for bench file discovery. @default "**\/*.bench.ts" */
	benchMatch: string;
	/** Node.js CLI flags passed when running each bench worker. */
	nodeFlags: string[];
	/** Directory for saved results and baseline pointer, relative to config file. @default ".labs" */
	resultsDir: string;
	/** Delta threshold for compare: changes within ±threshold are neutral. @default 0.05 (5%) */
	compareThreshold: number;
}

export function defineConfig(config: Partial<LabsConfig> & Pick<LabsConfig, 'benchDir'>): LabsConfig {
	return {
		benchMatch: '**/*.bench.ts',
		nodeFlags: ['--allow-natives-syntax', '--expose-gc'],
		resultsDir: '.labs',
		compareThreshold: 0.05,
		...config,
	};
}
