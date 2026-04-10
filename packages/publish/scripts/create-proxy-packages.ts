import fs from 'node:fs/promises';
import path from 'node:path';

const proxyPackages = [
	{
		folder: 'react',
		config: {
			type: 'module',
			main: '../dist/react.js',
			types: '../dist/react.d.ts',
		},
	},
];

async function generateCtsTypes() {
	const files = await fs.readdir('dist');
	const dtsFiles = files.filter((f) => f.endsWith('.d.ts'));
	for (const file of dtsFiles) {
		await fs.copyFile(path.join('dist', file), path.join('dist', file.replace(/\.d\.ts$/, '.d.cts')));
	}
	console.log(`✓ Generated ${dtsFiles.length} .d.cts files`);
}

async function createProxyPackages() {
	try {
		await generateCtsTypes();

		for (const { folder, config } of proxyPackages) {
			await fs.mkdir(folder, { recursive: true });
			await fs.writeFile(
				path.join(folder, 'package.json'),
				JSON.stringify(config, null, 2) + '\n',
			);
		}
		console.log(`✓ Created ${proxyPackages.length} proxy package.json files`);
	} catch (error) {
		console.error('\n> Error creating proxy packages:', error);
		process.exitCode = 1;
	}
}

createProxyPackages();
