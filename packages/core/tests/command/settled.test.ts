import { expect, it, vi } from 'vitest';
import { $internal, whenSettled, createWorld, relation, trait } from '../../src';

it('settles once after nested removals and reads the remaining target', () => {
  const world = createWorld();
  const Link = relation();
  const [a, b, c, d] = [world.spawn(), world.spawn(), world.spawn(), world.spawn()];
  const source = world.spawn(Link(a), Link(b), Link(c), Link(d));
  const values: unknown[] = [];
  const refresh = whenSettled(() => values.push(source.targetFor(Link)));
  source.onRemove(Link, refresh);
  source.onRemove(Link, (_, target) => {
    if (target === a) source.remove(Link(b));
  });
  source.remove(Link(a));
  expect(values).toEqual([source.targetFor(Link)]);
  expect(
    source
      .targetsFor(Link)
      .slice()
      .sort((x, y) => x - y)
  ).toEqual([c, d]);
});

it('settles after the entire destruction cascade', () => {
  const world = createWorld();
  const ChildOf = relation({ autoDestroy: 'source' });
  const parent = world.spawn();
  const child = world.spawn(ChildOf(parent));
  const grandchild = world.spawn(ChildOf(child));
  const values: boolean[][] = [];
  const refresh = whenSettled(() => {
    values.push([parent.isAlive(), child.isAlive(), grandchild.isAlive()]);
    expect(world.query(ChildOf('*')).length).toBe(0);
  });
  world.onExit([ChildOf('*')], refresh);
  parent.destroy();
  expect(values).toEqual([[false, false, false]]);
});

it('settles after bulk additions, exclusive replacement, and query reconciliation', () => {
  const world = createWorld();
  const A = trait();
  const B = trait();
  const Link = relation({ exclusive: true });
  const a = world.spawn();
  const b = world.spawn();
  const source = world.spawn(Link(a));
  const query = world.query(A, B);
  const values: unknown[] = [];
  const refresh = whenSettled(() => {
    values.push([source.has(A), source.has(B), source.targetFor(Link), query.toArray()]);
  });
  source.onAdd(A, refresh);
  source.onAdd(B, refresh);
  source.onAdd(Link, refresh);
  source.add(A, B, Link(b));
  expect(values).toEqual([[true, true, b, [source]]]);
});

it('processes structural work from settled callbacks without recursive notification', () => {
  const world = createWorld();
  const A = trait();
  const Trigger = trait();
  const source = world.spawn();
  let inside = false;
  const values: boolean[] = [];
  const refresh = whenSettled(() => {
    expect(inside).toBe(false);
    inside = true;
    values.push(source.has(A));
    if (!source.has(A)) source.add(A);
    inside = false;
  });
  source.onAdd(Trigger, refresh);
  source.onAdd(A, refresh);
  source.add(Trigger);
  expect(values).toEqual([false, true]);
});

it('delivers queued updates when a structural callback throws', () => {
  const world = createWorld();
  const A = trait();
  const B = trait();
  const source = world.spawn();
  const values: boolean[] = [];
  const refresh = whenSettled(() => values.push(source.has(A)));
  source.onAdd(A, refresh);
  source.onAdd(B, () => {
    throw new Error('stop');
  });
  expect(() => source.add(A, B)).toThrow('stop');
  expect(values).toEqual([true]);
  source.remove(A);
  source.add(A);
  expect(values).toEqual([true, true]);
});

it('runs the remaining callbacks and their queued changes before rethrowing a callback error', () => {
  const world = createWorld();
  const Tag = trait();
  const entity = world.spawn();
  const seen: boolean[] = [];
  const first = whenSettled(() => {
    entity.add(Tag);
    throw new Error('first callback');
  });
  const second = whenSettled(() => {
    seen.push(entity.has(Tag));
    throw new Error('second callback');
  });

  const Trigger = trait();
  entity.onAdd(Trigger, first);
  entity.onAdd(Trigger, second);
  expect(() => entity.add(Trigger)).toThrow('first callback');
  expect(seen).toEqual([false]);
  expect(entity.has(Tag)).toBe(true);
  world.destroy();
});

it('throws when a callback keeps triggering itself', () => {
  const world = createWorld();
  const Value = trait({ value: 0 });
  const source = world.spawn();
  const refresh = whenSettled(() => {
    source.set(Value, (prev) => ({ value: prev.value + 1 }));
  });
  source.onChange(Value, refresh);
  expect(() => source.add(Value)).toThrow('did not settle');
  // The queue is dropped, so the world keeps working.
  expect(() => world.spawn(Value)).not.toThrow();
});

it.each([
  ['reset', 'onRemove'],
  ['destroy', 'onExit'],
] as const)('settles %s after every entity is gone', (operation, hook) => {
  const world = createWorld();
  const A = trait();
  const source = world.spawn(A);
  const values: unknown[] = [];
  // The world still answers queries while it is being reset or destroyed.
  const refresh = whenSettled(() => {
    values.push([source.isAlive(), world.query(A).length]);
  });
  if (hook === 'onRemove') source.onRemove(A, refresh);
  else world.onExit([A], refresh);
  world[operation]();
  expect(values).toEqual([[false, 0]]);
  if (operation === 'destroy') expect(A[$internal].sharedMask.users).toBe(0);
});

it('runs value invalidations at once outside structural changes', () => {
  const world = createWorld();
  const Value = trait({ value: 0 });
  const source = world.spawn(Value);
  const values: number[] = [];
  const refresh = whenSettled(() => values.push(source.get(Value)!.value));
  source.onChange(Value, refresh);
  source.set(Value, { value: 1 });
  source.set(Value, { value: 2 });
  expect(values).toEqual([1, 2]);
});

it('coalesces by wrapper when subscriptions use the same function', () => {
  const world = createWorld();
  const Tag = trait();
  const entity = world.spawn();
  const notify = vi.fn();
  const refresh = whenSettled(notify);
  entity.onAdd(Tag, notify);
  entity.onAdd(Tag, refresh);
  world.onEnter([Tag], refresh);
  world.onEnter([Tag], whenSettled(notify));

  entity.add(Tag);
  expect(notify.mock.calls).toEqual([[entity], [], []]);
  world.destroy();
});

it('withdraws the pending notification only for the hook that unsubscribes', () => {
  const world = createWorld();
  const A = trait({ x: 0 });
  const B = trait({ x: 0 });
  const entity = world.spawn(A, B);
  const calls = vi.fn();
  const refresh = whenSettled(calls);
  const stopA = entity.onChange(A, refresh);
  const stopB = world.onChange(B, refresh);

  world.defer(() => {
    entity.changed(A);
    entity.changed(A);
    stopA();
  });
  expect(calls).not.toHaveBeenCalled();

  const stopAgain = entity.onChange(A, refresh);
  world.defer(() => {
    entity.changed(A);
    entity.changed(B);
    stopAgain();
    stopAgain();
    expect(calls).not.toHaveBeenCalled();
  });
  expect(calls.mock.calls).toEqual([[]]);
  stopB();
  world.destroy();
});

it('schedules a shared wrapper independently in nested worlds', () => {
  const first = createWorld();
  const second = createWorld();
  const Tag = trait();
  const sizes: number[][] = [];
  const refresh = whenSettled(() => sizes.push([first.query(Tag).length, second.query(Tag).length]));
  first.onEnter([Tag], refresh);
  second.onEntitySpawn(refresh);
  first.defer(() => {
    first.spawn(Tag);
    second.spawn(Tag);
    expect(sizes).toEqual([[1, 1]]);
    first.spawn(Tag);
  });
  expect(sizes).toEqual([
    [1, 1],
    [2, 1],
  ]);
  first.destroy();
  second.destroy();
});
