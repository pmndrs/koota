import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createChanged, createQuery, createWorld, Not, Or, relation, trait } from '../../src';

describe('Or branches', () => {
  const world = createWorld();
  const U = trait();
  const V = trait();

  beforeEach(() => {
    world.reset();
  });

  it('matches U or the absence of V before and after query creation', () => {
    const neither = world.spawn();
    const onlyU = world.spawn(U);
    world.spawn(V);
    const both = world.spawn(U, V);
    const query = createQuery(Or(U, Not(V)));
    expect(new Set(world.query(query))).toEqual(new Set([neither, onlyU, both]));

    const late = world.spawn();
    world.spawn(V);
    expect(new Set(world.query(query))).toEqual(new Set([neither, onlyU, both, late]));
    late.destroy();
    expect(new Set(world.query(query))).toEqual(new Set([neither, onlyU, both]));
  });

  it('updates mixed query membership and subscriptions when traits change', () => {
    const entity = world.spawn(V);
    const query = createQuery(Or(U, Not(V)));
    const added = vi.fn();
    const removed = vi.fn();
    world.onEnter(query, added);
    world.onExit(query, removed);

    entity.remove(V);
    expect(added).toHaveBeenCalledExactlyOnceWith(entity);
    entity.add(U, V);
    expect(removed).not.toHaveBeenCalled();
    entity.remove(U);
    expect(removed).toHaveBeenCalledExactlyOnceWith(entity);

    expect(world.query(query)).toHaveLength(0);
  });

  it.each(['trait', 'pair', 'not'] as const)(
    'keeps a static %s branch across tracking reads',
    (kind) => {
      const Included = trait();
      const T = trait({ value: 0 });
      const Changed = createChanged();
      const Rel = relation();
      const target = world.spawn();
      const branch = kind === 'trait' ? U : kind === 'pair' ? Rel(target) : Not(V);
      const tracked = world.spawn(Included, T, V);
      const persistent = world.spawn(Included);
      if (kind === 'trait') persistent.add(U);
      if (kind === 'pair') persistent.add(Rel(target));
      const query = createQuery(Included, Or(Changed(T), branch));

      expect(new Set(world.query(query))).toEqual(new Set([tracked, persistent]));
      expect(world.query(query).toArray()).toEqual([persistent]);
      tracked.set(T, { value: 1 });
      expect(new Set(world.query(query))).toEqual(new Set([tracked, persistent]));
      expect(world.query(query).toArray()).toEqual([persistent]);

      if (kind === 'trait') persistent.remove(U);
      if (kind === 'pair') persistent.remove(Rel(target));
      if (kind === 'not') persistent.add(V);
      expect(world.query(query)).toHaveLength(0);
      tracked.set(T, { value: 2 });
      expect(world.query(query).toArray()).toEqual([tracked]);
      expect(world.query(query)).toHaveLength(0);
    }
  );

  it('matches either generation during population and after membership changes', () => {
    const early = trait();
    const late = trait();
    const onlyEarly = world.spawn(early);
    const neither = world.spawn(...Array.from({ length: 40 }, () => trait()));
    const onlyLate = world.spawn(late);
    const both = world.spawn(early, late);
    const query = createQuery(Or(early, late));

    expect(new Set(world.query(query))).toEqual(new Set([onlyEarly, onlyLate, both]));
    onlyEarly.remove(early);
    neither.add(late);
    expect(new Set(world.query(query))).toEqual(new Set([onlyLate, both, neither]));
  });
});
