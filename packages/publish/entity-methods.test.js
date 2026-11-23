// @vitest-environment node
import { createRequire } from 'node:module';
import { expect, it } from 'vitest';
import { createWorld } from './dist/entity-methods.js';

it('keeps entity methods bound to the first runtime that creates a world', () => {
  const commonjs = createRequire(import.meta.url)('./dist/entity-methods.cjs');
  const first = createWorld();
  const entity = first.spawn();

  expect(commonjs.createWorld).toThrow(/one copy of koota\/entity-methods/);

  const second = createWorld();
  const other = second.spawn();
  entity.destroy();
  expect(first.isAlive(entity)).toBe(false);
  expect(second.isAlive(other)).toBe(true);
  first.destroy();
  second.destroy();
  expect(commonjs.createWorld).toThrow(/one copy of koota\/entity-methods/);
});
