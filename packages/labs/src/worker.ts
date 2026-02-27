import { run } from 'mitata';

const file = process.env.LABS_BENCH_FILE;
if (!file) {
	console.error('LABS_BENCH_FILE env var not set');
	process.exit(1);
}

await import(file);
await run();
