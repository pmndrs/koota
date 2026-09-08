import { beforeEach, expect, it } from 'vitest';
import { createArchetypeGraph } from '../src/archetype/archetype-graph';
import { $internal, createQuery, createWorld, Not, relation, trait, universe } from '../src';

beforeEach(() => universe.reset());

it('converges on one canonical node across trait orders and cached transitions', () => {
  const graph = createArchetypeGraph();
  const a = graph.add(graph.root, 0);
  const b = graph.add(graph.root, 17);
  const ab = graph.add(a, 17);

  expect(graph.add(b, 0)).toBe(ab);
  expect(ab.traitIds).toEqual([0, 17]);
  expect(graph.remove(ab, 17)).toBe(a);
  expect(graph.remove(ab, 0)).toBe(b);
  expect(graph.remove(a, 0)).toBe(graph.root);
  expect(graph.add(ab, 0)).toBe(ab);
  expect(graph.remove(ab, 33)).toBe(ab);

  const abc = graph.add(ab, 33);
  const ac = graph.remove(abc, 17);
  expect(graph.add(a, 33)).toBe(ac);
  expect(graph.add(ac, 17)).toBe(abc);
});

it('shares a required trait set across query layouts and filters', () => {
  const A = trait({ a: 1 });
  const B = trait({ b: 2 });
  const C = trait();
  const world = createWorld();
  const ab = world.spawn(A, B);
  const abc = world.spawn(A, B, C);
  world.spawn(A);

  expect(Array.from(world.query(A, B))).toEqual([ab, abc]);
  expect(Array.from(world.query(Not(C), B, A))).toEqual([ab]);

  const forward = createQuery(A, B);
  const reverse = createQuery(B, A);
  expect(createQuery(B, A)).toBe(reverse);
  expect(reverse.id).toBe(forward.id);
  world.query(reverse).readEach(([b, a]) => {
    expect(b).toEqual({ b: 2 });
    expect(a).toEqual({ a: 1 });
  });

  const required = universe.archetypes.add(
    universe.archetypes.add(universe.archetypes.root, B.id),
    A.id
  );
  for (const query of world[$internal].queriesHashMap.values()) {
    expect(query.requiredArchetype).toBe(required);
  }

  abc.remove(B);
  expect(Array.from(world.query(B, A))).toEqual([ab]);
  abc.add(B);
  expect(world.query(A, B)).toContain(abc);
  world.destroy();
});

it('shares trait sets between worlds without sharing entity results', () => {
  const A = trait();
  const B = trait();
  const first = createWorld();
  const second = createWorld();
  const a = first.spawn(A, B);
  const b = second.spawn(A, B);
  const query = createQuery(A, B);

  expect(Array.from(first.query(query))).toEqual([a]);
  expect(Array.from(second.query(B, A))).toEqual([b]);
  expect(first[$internal].queriesHashMap.get(query.hash)!.requiredArchetype).toBe(
    second[$internal].queriesHashMap.get(query.hash)!.requiredArchetype
  );
  first.destroy();
  second.destroy();
});

it('keeps relation targets out of the trait-set graph', () => {
  const A = trait();
  const ChildOf = relation();
  const world = createWorld();
  const first = world.spawn();
  const second = world.spawn();
  const child = world.spawn(A, ChildOf(first));
  const required = universe.archetypes.add(
    universe.archetypes.add(universe.archetypes.root, A.id),
    ChildOf[$internal].trait.id
  );

  expect(Array.from(world.query(A, ChildOf(first)))).toEqual([child]);
  expect(Array.from(world.query(ChildOf(second), A))).toEqual([]);
  for (const query of world[$internal].queriesHashMap.values()) {
    expect(query.requiredArchetype).toBe(required);
  }
  expect(required.traitIds).toEqual([A.id, ChildOf[$internal].trait.id].sort((a, b) => a - b));
  world.destroy();
});

it('preserves duplicate result parameters while canonicalizing trait requirements', () => {
  const A = trait({ a: 1 });
  const world = createWorld();
  world.spawn(A);
  const single = createQuery(A);
  const repeated = createQuery(A, A);

  expect(repeated.hash).toBe(single.hash);
  world.query(repeated).readEach(([first, second]) => {
    expect(first).toEqual({ a: 1 });
    expect(second).toEqual({ a: 1 });
  });
  world.destroy();
});

it('reuses explicit query layouts when concrete relation pairs are recreated', () => {
  const A = trait();
  const ChildOf = relation();
  const world = createWorld();
  const target = world.spawn();
  const direct = createQuery(A, ChildOf(target));
  const nested = createQuery(A, ChildOf(ChildOf(target)));

  for (let i = 0; i < 10; i++) {
    expect(createQuery(A, ChildOf(target))).toBe(direct);
    expect(createQuery(A, ChildOf(ChildOf(target)))).toBe(nested);
  }
  world.destroy();
});

it('rebuilds the graph on universe reset while preserving existing query refs', () => {
  const A = trait();
  const query = createQuery(A);
  const graph = universe.archetypes;
  universe.reset();
  expect(universe.archetypes).not.toBe(graph);

  const world = createWorld();
  const entity = world.spawn(A);
  expect(Array.from(world.query(query))).toEqual([entity]);
  expect(world[$internal].queriesHashMap.get(query.hash)!.requiredArchetype).toBe(
    universe.archetypes.add(universe.archetypes.root, A.id)
  );
  world.destroy();
});
