import fs from 'node:fs/promises';
import path from 'node:path';

const verbose = process.argv.includes('--verbose') || process.argv.includes('-v');

const proxyPackages = [
	{
		folder: 'react',
		config: {
			type: 'module',
			main: '../dist/react.js',
			types: '../dist/react.d.ts',
		},
	},
	{
		folder: 'devtools',
		config: {
			type: 'module',
			main: '../dist/devtools.js',
			types: '../dist/devtools.d.ts',
		},
	},
	{
		folder: 'devtools/vite',
		config: {
			type: 'module',
			main: '../../dist/devtools-vite.js',
			types: '../../dist/devtools-vite.d.ts',
		},
	},
	{
		folder: 'devtools/rollup',
		config: {
			type: 'module',
			main: '../../dist/devtools-rollup.js',
			types: '../../dist/devtools-rollup.d.ts',
		},
	},
	{
		folder: 'devtools/rolldown',
		config: {
			type: 'module',
			main: '../../dist/devtools-rolldown.js',
			types: '../../dist/devtools-rolldown.d.ts',
		},
	},
	{
		folder: 'devtools/webpack',
		config: {
			type: 'module',
			main: '../../dist/devtools-webpack.js',
			types: '../../dist/devtools-webpack.d.ts',
		},
	},
	{
		folder: 'devtools/esbuild',
		config: {
			type: 'module',
			main: '../../dist/devtools-esbuild.js',
			types: '../../dist/devtools-esbuild.d.ts',
		},
	},
];

async function createProxyPackages() {
	try {
		if (verbose) console.log('\n> Creating proxy package.json files...');

		for (const { folder, config } of proxyPackages) {
			// Ensure the folder exists
			await fs.mkdir(folder, { recursive: true });

			// Write the proxy package.json
			const packageJsonPath = path.join(folder, 'package.json');
			await fs.writeFile(packageJsonPath, JSON.stringify(config, null, 2) + '\n');

			if (verbose) {
				console.log(`  ✓ Created ${packageJsonPath}`);
			}
		}

		if (verbose) {
			console.log('\n> Proxy package.json files created successfully\n');
		} else {
			console.log(`✓ Created ${proxyPackages.length} proxy package.json files`);
		}
	} catch (error) {
		console.error('\n> Error creating proxy packages:', error);
		process.exit(1);
	}
}

createProxyPackages();
