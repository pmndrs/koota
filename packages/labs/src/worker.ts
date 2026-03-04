import { writeFileSync } from 'node:fs';
import { getBenchRegistry } from './index.ts';
import { measure, run } from 'mitata';
type TuneOptions = {
	min_cpu_time?: number;
	min_samples?: number;
	max_samples?: number;
	adaptive?: boolean | number;
	max_cpu_time?: number;
};

function parseTuneEnv(): TuneOptions {
	const minCpuTime = Number(process.env.LABS_MIN_CPU_TIME);
	const minSamples = Number(process.env.LABS_MIN_SAMPLES);
	const maxSamples = Number(process.env.LABS_MAX_SAMPLES);
	const maxCpuTime = Number(process.env.LABS_MAX_CPU_TIME);

	// LABS_ADAPTIVE: "false" → false, a numeric string → that number, anything else → true
	let adaptive: boolean | number | undefined;
	const adaptiveEnv = process.env.LABS_ADAPTIVE;
	if (adaptiveEnv !== undefined) {
		if (adaptiveEnv === 'false') adaptive = false;
		else {
			const n = Number(adaptiveEnv);
			adaptive = Number.isFinite(n) && n > 0 ? n : true;
		}
	}

	return {
		...(Number.isFinite(minCpuTime) && minCpuTime > 0 ? { min_cpu_time: minCpuTime } : {}),
		...(Number.isFinite(minSamples) && minSamples > 0 ? { min_samples: minSamples } : {}),
		...(Number.isFinite(maxSamples) && maxSamples > 0 ? { max_samples: maxSamples } : {}),
		...(Number.isFinite(maxCpuTime) && maxCpuTime > 0 ? { max_cpu_time: maxCpuTime } : {}),
		...(adaptive !== undefined ? { adaptive } : {}),
	};
}

const file = process.env.LABS_BENCH_FILE;
if (!file) {
	console.error('LABS_BENCH_FILE env var not set');
	process.exit(1);
}

async function calibrateFreq(): Promise<number> {
	const r = await measure(() => {}, { batch_unroll: 1 });
	return 1 / (r as any).avg;
}

await import(file);
const preFreq = await calibrateFreq();
const result = await run({ tune: parseTuneEnv() });
const postFreq = await calibrateFreq();
// preFreq/postFreq bracket the full benchmark suite to detect clock drift during the run

// Attach groupName to each trial using the registry built during bench registration.
// The registry and benchmarks[] are in the same sequential order.
const registry = getBenchRegistry();
for (let i = 0; i < result.benchmarks.length; i++) {
	(result.benchmarks[i] as any).groupName = registry[i]?.groupName ?? '';
}

if (process.env.LABS_RESULT_FILE) {
	writeFileSync(process.env.LABS_RESULT_FILE, JSON.stringify({ ...result, environment: { preFreq, postFreq } }));
}
