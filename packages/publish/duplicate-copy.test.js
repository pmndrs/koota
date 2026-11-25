// @vitest-environment node
import { createRequire } from 'node:module';
import { expect, it, vi } from 'vitest';
import { createWorld } from './dist/index.js';

it('warns when a second copy of koota takes over the entity methods', () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const commonjs = createRequire(import.meta.url)('./dist/index.cjs');

  const first = createWorld();
  first.spawn();
  expect(warn).not.toHaveBeenCalled();

  // The CommonJS build is a second copy with a table of its own.
  const second = commonjs.createWorld();
  const entity = second.spawn();
  expect(warn).toHaveBeenCalledOnce();
  expect(warn.mock.calls[0][0]).toMatch(/more than one copy of koota/);

  // The methods now belong to the copy that installed last.
  expect(entity.isAlive()).toBe(true);
  entity.destroy();
  expect(second.isAlive(entity)).toBe(false);

  commonjs.createWorld();
  expect(warn).toHaveBeenCalledOnce();
  warn.mockRestore();
});
