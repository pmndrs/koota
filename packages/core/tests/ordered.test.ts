import { beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest';
import { createChanged, ordered, relation, trait, type Entity } from '../src';
import { createWorld } from '../src/entity-methods';

describe('Ordered relation views', () => {
  const world = createWorld();
  beforeEach(() => world.reset());

  it('initializes the view before query observers run', () => {
    const ChildOf = relation();
    const Children = ordered(ChildOf);
    const added = vi.fn((parent: Entity) => expect(parent.get(Children)).toHaveLength(0));
    world.onQueryAdd([Children], added);
    const parent = world.spawn(Children);
    const child = world.spawn();
    parent.get(Children)!.add(child);
    expect(added).toHaveBeenCalledExactlyOnceWith(parent);
    expect(child.has(ChildOf(parent))).toBe(true);
  });

  it('syncs membership in both directions without duplicates', () => {
    const ChildOf = relation();
    const Children = ordered(ChildOf);
    const parent = world.spawn(Children);
    const children = parent.get(Children)!;
    const a = world.spawn(ChildOf(parent));
    const b = world.spawn();
    const c = world.spawn();
    children.add(b).insert(c, 1).add(a);
    expect(children.toArray()).toEqual([a, c, b]);
    expect(children.has(c)).toBe(true);
    expect(children.indexOf(c)).toBe(1);
    expect(c.has(ChildOf(parent))).toBe(true);
    expect(children.remove(c)).toBe(true);
    expect(c.has(ChildOf(parent))).toBe(false);
    a.remove(ChildOf(parent));
    expect([...children]).toEqual([b]);
    children.clear();
    expect(children.first).toBeUndefined();
    expect(b.has(ChildOf(parent))).toBe(false);
  });

  it('reorders without changing relations', () => {
    const ChildOf = relation();
    const Children = ordered(ChildOf);
    const parent = world.spawn(Children);
    const a = world.spawn(ChildOf(parent));
    const b = world.spawn(ChildOf(parent));
    const c = world.spawn(ChildOf(parent));
    const children = parent.get(Children)!;
    const removed = vi.fn();
    world.onRemove(ChildOf(parent), removed);
    children.moveTo(a, 2);
    expect(children.toArray()).toEqual([b, c, a]);
    children.sort((left, right) => right.id() - left.id());
    expect(children.map((child) => child.id())).toEqual([c.id(), b.id(), a.id()]);
    children.reverse();
    expect(children.toArray()).toEqual([a, b, c]);
    expect(removed).not.toHaveBeenCalled();
  });

  it('collects existing children when the ordered trait is added or re-added', () => {
    const ChildOf = relation();
    const Children = ordered(ChildOf);
    const parent = world.spawn();
    const child = world.spawn(ChildOf(parent));
    parent.add(Children);
    const previous = parent.get(Children)!;
    expect(previous.toArray()).toEqual([child]);
    parent.remove(Children);
    parent.add(Children);
    const children = parent.get(Children)!;
    expect(children).not.toBe(previous);
    expect(children.toArray()).toEqual([child]);
  });

  it('updates selected traits in child order', () => {
    const Position = trait({ x: 0 });
    const ChildOf = relation();
    const Children = ordered(ChildOf);
    const parent = world.spawn(Children);
    const a = world.spawn(Position, ChildOf(parent));
    const b = world.spawn(Position, ChildOf(parent));
    const children = parent.get(Children)!;
    const selected = children.select(Position);
    expectTypeOf(selected).not.toHaveProperty('sort');
    expect(selected).not.toHaveProperty('moveTo');
    children.moveTo(b, 0);
    selected.each((position, _entity, index) => {
      position.x = index + 1;
    });
    expect(b.get(Position)!.x).toBe(1);
    expect(a.get(Position)!.x).toBe(2);
    const c = world.spawn(Position);
    world.query(Children).each((view) => view.add(c));
    expect(selected.toArray()).toEqual([b, a, c]);
    expect(c.has(ChildOf(parent))).toBe(true);
  });

  it('notifies changes to membership and order', () => {
    const Changed = createChanged();
    const Children = ordered(relation());
    const parent = world.spawn(Children);
    const children = parent.get(Children)!;
    const child = world.spawn();
    expect(world.query(Changed(Children)).toArray()).toEqual([parent]);
    children.add(child).add(world.spawn());
    expect(world.query(Changed(Children)).toArray()).toEqual([parent]);
    children.reverse();
    expect(world.query(Changed(Children)).toArray()).toEqual([parent]);
    children.remove(child);
    expect(world.query(Changed(Children)).toArray()).toEqual([parent]);
  });

  it('follows exclusive reparenting and entity destruction', () => {
    const ChildOf = relation({ exclusive: true, autoDestroy: 'orphan' });
    const Children = ordered(ChildOf);
    const a = world.spawn(Children);
    const b = world.spawn(Children);
    const child = world.spawn(ChildOf(a));
    const left = a.get(Children)!;
    const right = b.get(Children)!;
    right.add(child);
    expect(left.length).toBe(0);
    expect(right.toArray()).toEqual([child]);
    child.destroy();
    expect(right.length).toBe(0);
    const next = world.spawn(ChildOf(a));
    a.destroy();
    expect(world.has(next)).toBe(false);
  });
});
