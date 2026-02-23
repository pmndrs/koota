import { execSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as p from '@clack/prompts';
import { COLORS } from './constants/colors';

const NODE_ARGS = ['--allow-natives-syntax', '--expose-gc'];
const CACHE_FILE = join(process.cwd(), 'node_modules', '.cache', 'bench-last.json');

const getBenchDirs = (baseDir: string) =>
	readdirSync(baseDir, { withFileTypes: true })
		.filter((e) => e.isDirectory() && existsSync(join(baseDir, e.name, 'src/main.ts')))
		.map((e) => e.name);

const loadLastSelection = (): string[] => {
	try {
		return JSON.parse(readFileSync(CACHE_FILE, 'utf-8'));
	} catch {
		return [];
	}
};

const saveSelection = (selected: string[]) => {
	const dir = join(CACHE_FILE, '..');
	if (!existsSync(dir)) execSync(`mkdir -p "${dir}"`);
	writeFileSync(CACHE_FILE, JSON.stringify(selected));
};

const runBench = (baseDir: string, name: string) => {
	const mainTs = join(baseDir, name, 'src/main.ts');
	console.log(
		`\n${COLORS.fg.blue}▶ ${name}${COLORS.reset} ${COLORS.dim}(tsx + v8 flags)${COLORS.reset}`
	);
	execSync(`pnpm dlx tsx ${NODE_ARGS.join(' ')} ${mainTs}`, { stdio: 'inherit' });
};

const main = async () => {
	const baseDir = join(process.cwd(), 'benches');
	if (!existsSync(baseDir)) {
		p.log.error('benches/ directory not found');
		process.exit(1);
	}

	const suites = getBenchDirs(baseDir);
	if (suites.length === 0) {
		p.log.error('No benchmarks found in benches/');
		process.exit(1);
	}

	const args = process.argv.slice(2);
	const lastFlag = args.includes('--last');

	// --last: replay previous selection without prompting.
	if (lastFlag) {
		const last = loadLastSelection().filter((s) => suites.includes(s));
		if (last.length === 0) {
			p.log.error('No previous selection found (or suites were removed)');
			process.exit(1);
		}
		p.intro(`${COLORS.fg.cyan}koota bench${COLORS.reset} ${COLORS.dim}(replaying last)${COLORS.reset}`);
		for (const name of last) runBench(baseDir, name);
		p.outro('Done');
		return;
	}

	// If a suite name was passed as an arg, run it directly.
	const arg = args.find((a) => !a.startsWith('-'));
	if (arg) {
		const match = suites.find((s) => s.includes(arg));
		if (!match) {
			p.log.error(`No suite matching "${arg}". Available: ${suites.join(', ')}`);
			process.exit(1);
		}
		runBench(baseDir, match);
		return;
	}

	p.intro(`${COLORS.fg.cyan}koota bench${COLORS.reset}`);

	const last = loadLastSelection().filter((s) => suites.includes(s));

	// Offer to replay last selection if one exists.
	if (last.length > 0) {
		const label = last.map((s) => `${COLORS.fg.cyan}${s}${COLORS.reset}`).join(', ');
		const replay = await p.confirm({
			message: `Replay last: ${label}?`,
			initialValue: true,
		});

		if (p.isCancel(replay)) {
			p.cancel('Cancelled');
			process.exit(0);
		}

		if (replay) {
			for (const name of last) runBench(baseDir, name);
			p.outro('Done');
			return;
		}
	}

	// Interactive multi-select with previous selection pre-checked.
	const lastSet = new Set(last);
	const selected = await p.multiselect({
		message: 'Select benchmarks to run',
		options: suites.map((s) => ({ value: s, label: s })),
		initialValues: suites.filter((s) => lastSet.has(s)),
		required: true,
	});

	if (p.isCancel(selected)) {
		p.cancel('Cancelled');
		process.exit(0);
	}

	saveSelection(selected);

	for (const name of selected) {
		runBench(baseDir, name);
	}

	p.outro('Done');
};

main();
