import { afterEach, beforeEach, expect, it } from 'vitest';
import { $internal, createQuery, createWorld, relation, trait, universe } from '../src';
import { hasNativeGc, waitForFinalization } from './utils/gc';

beforeEach(() => universe.reset());
afterEach(() => universe.reset());

it('preserves cached query tuple order after an inline query in another order', () => {
  const A = trait({ a: 1 });
  const B = trait({ b: 2 });
  const world = createWorld();
  world.spawn(A, B);
  world.query(B, A);

  const forward = createQuery(A, B);
  const reverse = createQuery(B, A);
  world.query(forward).updateEach(([a, b]) => {
    expect(a).toEqual({ a: 1 });
    expect(b).toEqual({ b: 2 });
  });
  world.query(reverse).readEach(([b, a]) => {
    expect(b).toEqual({ b: 2 });
    expect(a).toEqual({ a: 1 });
  });

  expect(createQuery(A, B)).toBe(forward);
  expect(world[$internal].queriesHashMap.size).toBe(1);
  world.destroy();
});

it.each(['onQueryAdd', 'onQueryRemove'] as const)(
  'does not let reused %s arrays change queries in another world',
  (subscribe) => {
    const A = trait();
    const B = trait();
    const first = createWorld();
    const parameters = [A];
    first[subscribe](parameters, () => {});
    parameters[0] = B;

    const second = createWorld();
    const a = second.spawn(A);
    second.spawn(B);
    expect(Array.from(second.query(A))).toEqual([a]);
    expect(Array.from(second.query(createQuery(A)))).toEqual([a]);
    first.destroy();
    second.destroy();
  }
);

it('does not retain inline entity-target query refs after world destruction', () => {
  const A = trait();
  const ChildOf = relation();
  for (let i = 0; i < 5; i++) {
    const world = createWorld();
    const targets = Array.from({ length: 100 }, () => world.spawn());
    for (const target of targets) world.query(A, ChildOf(target));
    world.destroy();
  }
  expect(universe.cachedQueries.size).toBe(0);
});

it('preserves cached queries across hash cache turnover and world reset', () => {
  const A = trait({ a: 1 });
  const B = trait({ b: 2 });
  const ChildOf = relation();
  const forward = createQuery(A, B);
  const reverse = createQuery(B, A);
  const world = createWorld();
  for (let i = 0; i < 1100; i++) world.query(A, ChildOf(world.spawn()));
  world.reset();

  const entity = world.spawn(A, B);
  expect(createQuery(A, B)).toBe(forward);
  expect(Array.from(world.query(forward))).toEqual([entity]);
  world.query(reverse).readEach(([b, a]) => {
    expect(b).toEqual({ b: 2 });
    expect(a).toEqual({ a: 1 });
  });
  expect(world[$internal].queriesHashMap.size).toBe(1);
  world.destroy();
});

it.skipIf(!hasNativeGc())('releases temporary relations after hash cache turnover', async () => {
  const A = trait();
  const ChildOf = relation();
  await expect(
    waitForFinalization((registry) => {
      (() => {
        const Temporary = relation();
        const world = createWorld();
        world.query(A, Temporary(world.spawn()));
        registry.register(Temporary, 'relation');
        world.destroy();
      })();

      const world = createWorld();
      for (let i = 0; i < 1100; i++) world.query(A, ChildOf(world.spawn()));
      world.destroy();
    })
  ).resolves.toBe(true);
});
