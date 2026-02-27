import { bench as _bench, group as _group, type B } from 'mitata';

export { defineConfig } from './config.ts';
export type { LabsConfig } from './config.ts';

const tagStack: string[][] = [];
const grepTags = process.env.LABS_GREP_TAGS?.split(',').filter(Boolean) ?? [];

function parseTags(name: string): { cleanName: string; tags: string[] } {
	const tags: string[] = [];
	const cleanName = name
		.replace(/@\S+/g, (m) => {
			tags.push(m);
			return '';
		})
		.trim();
	return { cleanName, tags };
}

function effectiveTags(ownTags: string[]): string[] {
	return [...tagStack.flat(), ...ownTags];
}

function matchesGrep(tags: string[]): boolean {
	if (grepTags.length === 0) return true;
	if (tags.length === 0) return false;
	return grepTags.some((t) => tags.includes(t));
}

const NOOP_B = new Proxy({} as B, {
	get: (_, prop) => (prop === 'run' ? () => Promise.resolve({}) : () => NOOP_B),
});

export function bench(fn: () => any): B;
export function bench(name: string, fn: () => any): B;
export function bench(gen: (state: any) => Generator): B;
export function bench(name: string, gen: (state: any) => Generator): B;
export function bench(nameOrFn: string | ((...args: any[]) => any), fn?: any): B {
	if (typeof nameOrFn === 'function') {
		if (!matchesGrep(effectiveTags([]))) return NOOP_B;
		return _bench(nameOrFn);
	}

	const { cleanName, tags } = parseTags(nameOrFn);
	if (!matchesGrep(effectiveTags(tags))) return NOOP_B;
	return _bench(cleanName, fn);
}

export function group(f: () => any): void;
export function group(name: string, f: () => any): void;
export function group(nameOrFn: string | (() => any), fn?: () => any): void | Promise<void> {
	if (typeof nameOrFn === 'function') return _group(nameOrFn);

	const { cleanName, tags } = parseTags(nameOrFn);
	tagStack.push(tags);

	const result = _group(cleanName, fn!);
	const maybePromise = result as unknown as { finally?: (cb: () => void) => unknown };
	if (typeof maybePromise?.finally === 'function') {
		return maybePromise.finally(() => tagStack.pop()) as Promise<void>;
	}
	tagStack.pop();
	return result;
}
