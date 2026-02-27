export interface LabsConfig {
	/** Directory to search for bench files, relative to the config file. */
	benchDir: string;
	/** Glob pattern for bench file discovery. @default "**\/*.bench.ts" */
	benchMatch: string;
	/** Node.js CLI flags passed when running each bench worker. */
	nodeFlags: string[];
}

export function defineConfig(config: Partial<LabsConfig> & Pick<LabsConfig, 'benchDir'>): LabsConfig {
	return {
		benchMatch: '**/*.bench.ts',
		nodeFlags: ['--allow-natives-syntax', '--expose-gc'],
		...config,
	};
}
