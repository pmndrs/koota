import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createChanged,
  createQuery,
  createRemoved,
  createWorld,
  Not,
  Or,
  relation,
  trait,
} from '../src';

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

  it('keeps a single negated branch correct through spawn, add and remove', () => {
    const entity = world.spawn();
    world.spawn(V);
    const query = createQuery(Or(Not(V)));
    expect(world.query(query).toArray()).toEqual([entity]);

    entity.add(V);
    expect(world.query(query)).toHaveLength(0);
    entity.remove(V);
    expect(world.query(query).toArray()).toEqual([entity]);
    const late = world.spawn(U);
    world.spawn(U, V);
    expect(new Set(world.query(query))).toEqual(new Set([entity, late]));
  });

  it('keeps grouped negations distinct in the query cache', () => {
    const neither = world.spawn();
    const onlyU = world.spawn(U);
    const onlyV = world.spawn(V);
    world.spawn(U, V);
    expect(world.query(Or(Not(U, V))).toArray()).toEqual([neither]);
    expect(new Set(world.query(Or(Not(U), Not(V))))).toEqual(new Set([neither, onlyU, onlyV]));
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

  it('combines negated traits and pairs within one branch', () => {
    const Included = trait();
    const Rel = relation();
    const target = world.spawn();
    const query = createQuery(Included, Or(U, Not(V, Rel(target))));
    world.query(query);
    const entity = world.spawn(Included);
    expect(world.query(query).toArray()).toEqual([entity]);
    entity.add(Rel(target));
    expect(world.query(query)).toHaveLength(0);
    entity.add(U, V);
    expect(world.query(query).toArray()).toEqual([entity]);
    entity.remove(U, Rel(target));
    expect(world.query(query)).toHaveLength(0);
    entity.remove(V);
    expect(world.query(query).toArray()).toEqual([entity]);
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

  it('requires outer tracking terms even when a static or branch matches', () => {
    const T = trait({ value: 0 });
    const W = trait({ value: 0 });
    const Changed = createChanged();
    const entity = world.spawn(T, W);
    const query = createQuery(Changed(W), Or(Changed(T), Not(V)));
    expect(world.query(query).toArray()).toEqual([entity]);
    expect(world.query(query)).toHaveLength(0);
    entity.set(T, { value: 1 });
    expect(world.query(query)).toHaveLength(0);
    entity.set(W, { value: 1 });
    expect(world.query(query).toArray()).toEqual([entity]);
    expect(world.query(query)).toHaveLength(0);
  });

  it('adds traitless static matches after a mixed query exists and drops them on destroy', () => {
    const Changed = createChanged();
    const query = createQuery(Or(Changed(U), Not(V)));
    world.query(query);
    const entity = world.spawn();
    expect(world.query(query).toArray()).toEqual([entity]);
    expect(world.query(query).toArray()).toEqual([entity]);
    entity.destroy();
    expect(world.query(query)).toHaveLength(0);
  });

  it('consumes Removed matches once and keeps only live static pair matches', () => {
    const Rel = relation();
    const Removed = createRemoved();
    const target = world.spawn();
    const tracked = world.spawn(U);
    const persistent = world.spawn(U, Rel(target));
    const query = createQuery(Or(Removed(U), Rel(target)));
    expect(world.query(query).toArray()).toEqual([persistent]);
    tracked.destroy();
    expect(new Set(world.query(query))).toEqual(new Set([tracked, persistent]));
    expect(world.query(query).toArray()).toEqual([persistent]);
    persistent.destroy();
    expect(world.query(query).toArray()).toEqual([persistent]);
    expect(world.query(query)).toHaveLength(0);
  });

  it('allows a static alternative to filter an outer Removed term after destruction', () => {
    const Changed = createChanged();
    const Removed = createRemoved();
    const entity = world.spawn(U, V);
    const query = createQuery(Removed(U), Or(Changed(V), Not(trait())));
    expect(world.query(query)).toHaveLength(0);
    entity.destroy();
    expect(world.query(query).toArray()).toEqual([entity]);
    expect(world.query(query)).toHaveLength(0);
  });

  it('keeps tracker-only alternatives consumable independently', () => {
    const A = trait({ value: 0 });
    const B = trait({ value: 0 });
    const C = trait({ value: 0 });
    const Changed = createChanged();
    const entity = world.spawn(A, B, C);
    const query = createQuery(Or(Changed(A), Changed(B), Changed(C)));
    const counts = [world.query(query).length, world.query(query).length];
    entity.set(B, { value: 1 });
    counts.push(world.query(query).length, world.query(query).length);
    entity.set(C, { value: 1 });
    counts.push(world.query(query).length, world.query(query).length);
    expect(counts).toEqual([1, 0, 1, 0, 1, 0]);
  });
});
