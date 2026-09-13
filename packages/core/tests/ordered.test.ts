import { beforeEach, describe, expect, it } from 'vitest';
import { createWorld, relation } from '../src';

describe('Ordered relations', () => {
  const world = createWorld();

  beforeEach(() => {
    world.reset();
  });

  it('keeps sources in insertion order as children come and go', () => {
    const ChildOf = relation({ ordered: true });
    const parent = world.spawn();
    const a = world.spawn(ChildOf(parent));
    const b = world.spawn();
    const c = world.spawn();
    b.add(ChildOf(parent));
    c.add(ChildOf(parent));
    expect(parent.sourcesFor(ChildOf)).toEqual([a, b, c]);
    b.remove(ChildOf(parent));
    expect(parent.sourcesFor(ChildOf)).toEqual([a, c]);
    b.add(ChildOf(parent));
    expect(parent.sourcesFor(ChildOf)).toEqual([a, c, b]);
    c.destroy();
    expect(parent.sourcesFor(ChildOf)).toEqual([a, b]);
  });

  it('returns queries on the pair in the same order', () => {
    const ChildOf = relation({ ordered: true });
    const parent = world.spawn();
    const a = world.spawn(ChildOf(parent));
    const b = world.spawn(ChildOf(parent));
    const c = world.spawn(ChildOf(parent));
    expect([...world.query(ChildOf(parent))]).toEqual([a, b, c]);
    parent.orderSources(ChildOf, [c, a, b]);
    expect([...world.query(ChildOf(parent))]).toEqual([c, a, b]);
    expect(parent.sourcesFor(ChildOf)).toEqual([c, a, b]);
  });

  it('reorders without touching the relation and rejects a changed set', () => {
    const ChildOf = relation({ ordered: true });
    const parent = world.spawn();
    const a = world.spawn(ChildOf(parent));
    const b = world.spawn(ChildOf(parent));
    const stranger = world.spawn();
    parent.orderSources(ChildOf, [b, a]);
    expect(a.has(ChildOf(parent))).toBe(true);
    expect(b.has(ChildOf(parent))).toBe(true);
    expect(() => parent.orderSources(ChildOf, [a])).toThrow('every current source');
    expect(() => parent.orderSources(ChildOf, [a, stranger])).toThrow('every current source');
    expect(parent.sourcesFor(ChildOf)).toEqual([b, a]);
  });

  it('answers sourcesFor on relations without the flag and refuses to order them', () => {
    const Likes = relation();
    const target = world.spawn();
    const a = world.spawn(Likes(target));
    const b = world.spawn(Likes(target));
    expect([...parent_sorted(target.sourcesFor(Likes))]).toEqual(parent_sorted([a, b]));
    expect(() => target.orderSources(Likes, [b, a])).toThrow('ordered relation');
  });

  it('starts clean after a reset', () => {
    const ChildOf = relation({ ordered: true });
    const parent = world.spawn();
    world.spawn(ChildOf(parent));
    world.reset();
    const next = world.spawn();
    const child = world.spawn(ChildOf(next));
    expect(next.sourcesFor(ChildOf)).toEqual([child]);
  });
});

function parent_sorted(entities: readonly number[]): number[] {
  return [...entities].sort((x, y) => x - y);
}
