import { expect, it } from 'vitest';
import { createAdded, createQuery, Not, Or, relation, trait, type Entity } from '../src';

it('keeps relation targets distinct across the full entity handle range', () => {
  const first = relation();
  const second = relation();
  const a = createQuery(first(10_000_000 as Entity));
  const b = createQuery(second(0 as Entity));
  expect(a).not.toBe(b);
  expect(a.hash).not.toBe(b.hash);
});

it('keeps nested tracking terms distinct and canonical', () => {
  const a = trait();
  const b = trait();
  const Added = createAdded();
  const OtherAdded = createAdded();
  expect(createQuery(Or(Added(a)))).not.toBe(createQuery(Or(OtherAdded(a))));
  expect(createQuery(Or(Added(a, b)))).toBe(createQuery(Or(Added(b), Added(a))));
  expect(createQuery(Not(a, b))).toBe(createQuery(Not(b), Not(a)));
});

it('hashes every term in queries larger than the default workspace', () => {
  const traits = Array.from({ length: 1200 }, () => trait());
  const query = createQuery(...traits);
  expect(query).toBe(createQuery(...traits.toReversed()));
  expect(query).not.toBe(createQuery(...traits.slice(0, 1024)));
  const link = relation();
  expect(createQuery(traits[0], link(traits[0], ...traits.slice(1)))).toBe(
    createQuery(link(traits[1199], ...traits.slice(0, 1199).toReversed()), traits[0])
  );
});
