import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import { unplugin } from '../plugin';
import type { UnpluginOptions, HookFnMap } from 'unplugin';

const plugin = unplugin.raw({}, { framework: 'vite' }) as UnpluginOptions;
const hook = plugin.transform;
const transformFn: HookFnMap['transform'] | undefined =
	typeof hook === 'function' ? hook : hook?.handler;

const fixturesDir = resolve(import.meta.dirname, 'fixtures');

function readFixture(name: string) {
	const path = resolve(fixturesDir, name);
	return { code: readFileSync(path, 'utf-8'), path };
}

function transform(code: string, id: string) {
	const result = transformFn?.call({} as any, code, id) as { code: string } | null;
	return result?.code ?? null;
}

describe('Debug Unplugin', () => {
	it('adds debugName and debugSource to trait', () => {
		const { code, path } = readFixture('traits.ts');
		const output = transform(code, path);

		expect(output).toContain('Position.debugName = "Position"');
		expect(output).toContain(`Position.debugSource = { file: "${path}", line: 3, column: 24 }`);
	});

	it('adds debugName and debugSource to relation', () => {
		const { code, path } = readFixture('traits.ts');
		const output = transform(code, path);

		expect(output).toContain('ChildOf.debugName = "ChildOf"');
		expect(output).toContain(`ChildOf.debugSource = { file: "${path}", line: 5, column: 23 }`);
	});

	it('handles multiple declarations in one file', () => {
		const { code, path } = readFixture('traits.ts');
		const output = transform(code, path);

		expect(output).toContain('Position.debugName = "Position"');
		expect(output).toContain('Velocity.debugName = "Velocity"');
		expect(output).toContain('ChildOf.debugName = "ChildOf"');
		expect(output).toContain('IsTagged.debugName = "IsTagged"');
	});

	it('returns null for files without trait/relation', () => {
		const { code, path } = readFixture('no-traits.ts');
		const output = transform(code, path);

		expect(output).toBeNull();
	});
});
