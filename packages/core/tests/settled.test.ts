import { expect, it } from 'vitest';
import { $internal, createWorld, ordered, relation, trait } from '../src';

it('settles once after nested removals and observes the remaining target', () => {
  const world = createWorld();
  const Link = relation();
  const [a, b, c, d] = [world.spawn(), world.spawn(), world.spawn(), world.spawn()];
  const source = world.spawn(Link(a), Link(b), Link(c), Link(d));
  const observed: unknown[] = [];
  const observer = world[$internal].observeSettled(() => observed.push(source.targetFor(Link)));
  source.onRemove(Link, observer.invalidate);
  source.onRemove(Link, (_, target) => {
    if (target === a) source.remove(Link(b));
  });
  source.remove(Link(a));
  expect(observed).toEqual([source.targetFor(Link)]);
  expect(observed).toEqual([c]);
});

for (const retain of [0, 1024]) {
  it(`settles after the entire destruction cascade with retain ${retain}`, () => {
    const world = createWorld({ retain });
    const ChildOf = relation({ autoDestroy: 'source' });
    const parent = world.spawn();
    const child = world.spawn(ChildOf(parent));
    const grandchild = world.spawn(ChildOf(child));
    const observed: boolean[][] = [];
    const observer = world[$internal].observeSettled(() => {
      observed.push([parent.isAlive(), child.isAlive(), grandchild.isAlive()]);
      expect(world.query(ChildOf('*')).length).toBe(0);
    });
    world.onQueryRemove([ChildOf('*')], observer.invalidate);
    parent.destroy();
    expect(observed).toEqual([[false, false, false]]);
  });
}

it('settles after bulk additions, exclusive replacement, and query reconciliation', () => {
  const world = createWorld();
  const A = trait();
  const B = trait();
  const Link = relation({ exclusive: true });
  const a = world.spawn();
  const b = world.spawn();
  const source = world.spawn(Link(a));
  const query = world.query(A, B);
  const observed: unknown[] = [];
  const observer = world[$internal].observeSettled(() => {
    observed.push([source.has(A), source.has(B), source.targetFor(Link), query.toArray()]);
  });
  source.onAdd(A, observer.invalidate);
  source.onAdd(B, observer.invalidate);
  source.onAdd(Link, observer.invalidate);
  source.add(A, B, Link(b));
  expect(observed).toEqual([[true, true, b, [source]]]);
});

it('drops a queued update when unsubscribed before settlement', () => {
  const world = createWorld();
  const A = trait();
  const source = world.spawn();
  let calls = 0;
  const observer = world[$internal].observeSettled(() => calls++);
  source.onAdd(A, observer.invalidate);
  source.onAdd(A, observer.unsubscribe);
  source.add(A);
  expect(calls).toBe(0);
});

it('processes structural work from settled callbacks without recursive notification', () => {
  const world = createWorld();
  const A = trait();
  const Trigger = trait();
  const source = world.spawn();
  let inside = false;
  const observed: boolean[] = [];
  const observer = world[$internal].observeSettled(() => {
    expect(inside).toBe(false);
    inside = true;
    observed.push(source.has(A));
    if (!source.has(A)) source.add(A);
    inside = false;
  });
  source.onAdd(Trigger, observer.invalidate);
  source.onAdd(A, observer.invalidate);
  source.add(Trigger);
  expect(observed).toEqual([false, true]);
});

it('delivers queued updates when a structural callback throws', () => {
  const world = createWorld();
  const A = trait();
  const B = trait();
  const source = world.spawn();
  const observed: boolean[] = [];
  const observer = world[$internal].observeSettled(() => observed.push(source.has(A)));
  source.onAdd(A, observer.invalidate);
  source.onAdd(B, () => {
    throw new Error('stop');
  });
  expect(() => source.add(A, B)).toThrow('stop');
  expect(observed).toEqual([true]);
  // The operation is closed, so a later invalidation is not left waiting for it.
  observer.invalidate();
  expect(observed).toEqual([true, true]);
});

it('delivers the other queued updates and keeps settling after an observer throws', () => {
  const world = createWorld();
  const A = trait();
  const source = world.spawn();
  let calls = 0;
  const failing = world[$internal].observeSettled(() => {
    throw new Error('stop');
  });
  const counting = world[$internal].observeSettled(() => calls++);
  source.onAdd(A, failing.invalidate);
  source.onAdd(A, counting.invalidate);
  source.onRemove(A, counting.invalidate);
  expect(() => source.add(A)).toThrow('stop');
  expect(calls).toBe(1);
  source.remove(A);
  expect(calls).toBe(2);
});

it('throws when an observer keeps invalidating itself', () => {
  const world = createWorld();
  const Value = trait({ value: 0 });
  const source = world.spawn();
  const observer = world[$internal].observeSettled(() => {
    source.set(Value, (prev) => ({ value: prev.value + 1 }));
  });
  source.onChange(Value, observer.invalidate);
  expect(() => source.add(Value)).toThrow('did not settle');
  // The queue is dropped, so the world keeps working.
  expect(() => world.spawn(Value)).not.toThrow();
});

it('settles reset after every entity is gone', () => {
  const world = createWorld();
  const A = trait();
  const source = world.spawn(A);
  const observed: unknown[] = [];
  const observer = world[$internal].observeSettled(() => {
    observed.push([source.isAlive(), world.query(A).length]);
  });
  source.onRemove(A, observer.invalidate);
  world.reset();
  expect(observed).toEqual([[false, 0]]);
});

it('settles world destruction before the world unregisters', () => {
  const world = createWorld();
  const A = trait();
  world.spawn(A);
  const observed: number[] = [];
  const observer = world[$internal].observeSettled(() => observed.push(world.query(A).length));
  world.onQueryRemove([A], observer.invalidate);
  world.destroy();
  expect(observed).toEqual([0]);
  expect(world.isRegistered).toBe(false);
});

it('runs value invalidations at once outside structural changes', () => {
  const world = createWorld();
  const Value = trait({ value: 0 });
  const source = world.spawn(Value);
  const observed: number[] = [];
  const observer = world[$internal].observeSettled(() => observed.push(source.get(Value)!.value));
  source.onChange(Value, observer.invalidate);
  source.set(Value, { value: 1 });
  source.set(Value, { value: 2 });
  expect(observed).toEqual([1, 2]);
});

it('settles ordered clear after removing every relation and updating the owned sequence', () => {
  const world = createWorld();
  const ChildOf = relation();
  const Children = ordered(ChildOf);
  const parent = world.spawn(Children);
  const children = parent.get(Children)!;
  const a = world.spawn();
  const b = world.spawn();
  children.add(a).add(b);
  const observed: unknown[] = [];
  const observer = world[$internal].observeSettled(() => observed.push(children.toArray()));
  a.onRemove(ChildOf, observer.invalidate);
  b.onRemove(ChildOf, observer.invalidate);
  parent.onChange(Children, observer.invalidate);
  children.clear();
  expect(observed).toEqual([[]]);
});
