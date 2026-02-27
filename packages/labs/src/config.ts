export interface LabsConfig {
	/** Directory to search for bench files, relative to the config file. */
	testDir: string;
	/** Glob pattern for bench file discovery. @default "**\/*.bench.ts" */
	testMatch: string;
	/** Node.js CLI flags passed when running each bench worker. */
	nodeFlags: string[];
}

export function defineConfig(config: Partial<LabsConfig> & Pick<LabsConfig, 'testDir'>): LabsConfig {
	return {
		testMatch: '**/*.bench.ts',
		nodeFlags: ['--allow-natives-syntax', '--expose-gc'],
		...config,
	};
}
