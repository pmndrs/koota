import { writeFileSync } from 'node:fs';
import { getBenchRegistry } from './index.ts';
import { run } from 'mitata';
type TuneOptions = {
	min_cpu_time?: number;
	min_samples?: number;
	max_samples?: number;
};

function parseTuneEnv(): TuneOptions {
	const minCpuTime = Number(process.env.LABS_MIN_CPU_TIME);
	const minSamples = Number(process.env.LABS_MIN_SAMPLES);
	const maxSamples = Number(process.env.LABS_MAX_SAMPLES);

	return {
		...(Number.isFinite(minCpuTime) && minCpuTime > 0 ? { min_cpu_time: minCpuTime } : {}),
		...(Number.isFinite(minSamples) && minSamples > 0 ? { min_samples: minSamples } : {}),
		...(Number.isFinite(maxSamples) && maxSamples > 0 ? { max_samples: maxSamples } : {}),
	};
}

const file = process.env.LABS_BENCH_FILE;
if (!file) {
	console.error('LABS_BENCH_FILE env var not set');
	process.exit(1);
}

await import(file);
const result = await run({ tune: parseTuneEnv() });

// Attach groupName to each trial using the registry built during bench registration.
// The registry and benchmarks[] are in the same sequential order.
const registry = getBenchRegistry();
for (let i = 0; i < result.benchmarks.length; i++) {
	(result.benchmarks[i] as any).groupName = registry[i]?.groupName ?? '';
}

if (process.env.LABS_RESULT_FILE) {
	writeFileSync(process.env.LABS_RESULT_FILE, JSON.stringify(result));
}
