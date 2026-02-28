import { writeFileSync } from 'node:fs';
import { getBenchRegistry } from './index.ts';
import { run } from 'mitata';

const file = process.env.LABS_BENCH_FILE;
if (!file) {
	console.error('LABS_BENCH_FILE env var not set');
	process.exit(1);
}

await import(file);
const result = await run();

// Attach groupName to each trial using the registry built during bench registration.
// The registry and benchmarks[] are in the same sequential order.
const registry = getBenchRegistry();
for (let i = 0; i < result.benchmarks.length; i++) {
	(result.benchmarks[i] as any).groupName = registry[i]?.groupName ?? '';
}

if (process.env.LABS_RESULT_FILE) {
	writeFileSync(process.env.LABS_RESULT_FILE, JSON.stringify(result));
}
