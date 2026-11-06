import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  createAdded,
  createChanged,
  createQuery,
  createRemoved,
  createWorld,
  Not,
  relation,
  trait,
} from '../src';

describe('queryFirst', () => {
  const world = createWorld();

  beforeEach(() => world.reset());
  afterAll(() => world.destroy());

  it.each(['inline', 'cached'] as const)('finds the first current match (%s)', (mode) => {
    const Position = trait({ x: 0 });
    const Hidden = trait();
    const query = createQuery(Position, Not(Hidden));
    const first = () =>
      mode === 'cached' ? world.queryFirst(query) : world.queryFirst(Position, Not(Hidden));

    expect(first()).toBeUndefined();
    const a = world.spawn(Position);
    const b = world.spawn(Position);
    const hidden = world.spawn(Position, Hidden);
    expect(first()).toBe(a);
    expect(first()).toBe(a);

    a.remove(Position);
    expect(first()).toBe(b);
    b.destroy();
    expect(first()).toBeUndefined();
    hidden.remove(Hidden);
    expect(first()).toBe(hidden);

    world.reset();
    expect(first()).toBeUndefined();
    const fresh = world.spawn(Position);
    expect(first()).toBe(fresh);
  });

  it('initializes a fresh world and excludes its world entity', () => {
    const fresh = createWorld();
    expect(fresh.queryFirst()).toBeUndefined();
    const entity = fresh.spawn();
    expect(fresh.queryFirst()).toBe(entity);
    entity.destroy();
    expect(fresh.queryFirst()).toBeUndefined();
    fresh.destroy();
  });

  it.each(['inline', 'cached'] as const)('finds sources of a specific relation (%s)', (mode) => {
    const ChildOf = relation();
    const parent = world.spawn();
    const query = createQuery(ChildOf(parent));
    const first = () =>
      mode === 'cached' ? world.queryFirst(query) : world.queryFirst(ChildOf(parent));

    expect(first()).toBeUndefined();
    const a = world.spawn(ChildOf(parent));
    const b = world.spawn(ChildOf(parent));
    expect(first()).toBe(a);
    a.remove(ChildOf(parent));
    expect(first()).toBe(b);
    b.destroy();
    expect(first()).toBeUndefined();

    const c = world.spawn(ChildOf(parent));
    expect(first()).toBe(c);
    parent.destroy();
    expect(first()).toBeUndefined();
  });

  it('supports wildcard relations and changing target filters', () => {
    const ChildOf = relation();
    const Active = trait();
    const parent = world.spawn();
    const child = world.spawn(ChildOf(parent));

    expect(world.queryFirst(ChildOf('*'))).toBe(child);
    expect(world.queryFirst(ChildOf(Active))).toBeUndefined();
    parent.add(Active);
    expect(world.queryFirst(ChildOf(Active))).toBe(child);
    parent.remove(Active);
    expect(world.queryFirst(ChildOf(Active))).toBeUndefined();
    child.remove(ChildOf(parent));
    expect(world.queryFirst(ChildOf('*'))).toBeUndefined();
  });

  it('shares an inline relation query and skips pending removals during a walk', () => {
    const Position = trait({ x: 0 });
    const ChildOf = relation();
    const parent = world.spawn();
    const a = world.spawn(Position, ChildOf(parent));
    const b = world.spawn(Position, ChildOf(parent));

    expect(world.queryFirst(Position, ChildOf(parent))).toBe(a);
    const view = world.query(Position, ChildOf(parent));
    view.forEach((entity) => {
      if (entity === a) {
        a.remove(Position);
        expect(world.queryFirst(Position, ChildOf(parent))).toBe(b);
      }
    });
    expect(world.queryFirst(Position, ChildOf(parent))).toBe(b);
    parent.destroy();
    expect(world.queryFirst(Position, ChildOf(parent))).toBeUndefined();
  });

  it('consumes a tracking batch through a warmed inline lookup', () => {
    const Position = trait({ x: 0 });
    const Changed = createChanged();
    const a = world.spawn(Position);
    const b = world.spawn(Position);

    expect(world.queryFirst(Changed(Position))).toBe(a);
    expect(world.queryFirst(Changed(Position))).toBeUndefined();
    a.changed(Position);
    b.changed(Position);
    expect(world.queryFirst(Changed(Position))).toBe(a);
    expect(world.query(Changed(Position))).toHaveLength(0);
    b.changed(Position);
    expect(world.queryFirst(Changed(Position))).toBe(b);
    expect(world.queryFirst(Changed(Position))).toBeUndefined();
  });

  it.each([
    ['added', createAdded],
    ['changed', createChanged],
    ['removed', createRemoved],
  ] as const)('consumes and resets the entire %s batch', (type, createTracker) => {
    const Foo = trait();
    const Bar = trait();
    const Tracked = createTracker();
    const query = createQuery(Tracked(Foo, Bar));
    const a = world.spawn();
    const b = world.spawn();
    if (type !== 'added') {
      a.add(Foo, Bar);
      b.add(Foo, Bar);
    }
    expect(world.queryFirst(query)).toBe(type === 'changed' ? a : undefined);

    for (const entity of [a, b]) {
      if (type === 'added') entity.add(Foo, Bar);
      else if (type === 'removed') entity.remove(Foo, Bar);
      else {
        entity.changed(Foo);
        entity.changed(Bar);
      }
    }
    expect(world.queryFirst(query)).toBe(a);
    expect(world.queryFirst(query)).toBeUndefined();
    expect(world.query(query)).toHaveLength(0);

    if (type === 'added') {
      b.remove(Foo, Bar);
      b.add(Foo);
    } else if (type === 'removed') {
      b.add(Foo, Bar);
      b.remove(Foo);
    } else b.changed(Foo);
    expect(world.queryFirst(Tracked(Foo, Bar))).toBeUndefined();

    if (type === 'added') b.add(Bar);
    else if (type === 'removed') b.remove(Bar);
    else b.changed(Bar);
    expect(world.queryFirst(query)).toBe(b);
    expect(world.queryFirst(query)).toBeUndefined();
  });
});
