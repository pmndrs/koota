import { writeFileSync } from 'node:fs';
import { run } from 'mitata';

const file = process.env.LABS_BENCH_FILE;
if (!file) {
	console.error('LABS_BENCH_FILE env var not set');
	process.exit(1);
}

await import(file);
const result = await run();

if (process.env.LABS_RESULT_FILE) {
	writeFileSync(process.env.LABS_RESULT_FILE, JSON.stringify(result));
}
