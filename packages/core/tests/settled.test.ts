import { expect, it } from 'vitest';
import { $internal, createWorld, ordered, relation, trait } from '../src';

it('settles once after nested removals and observes the remaining target', () => {
  const world = createWorld();
  const Link = relation();
  const [a, b, c, d] = [world.spawn(), world.spawn(), world.spawn(), world.spawn()];
  const source = world.spawn(Link(a), Link(b), Link(c), Link(d));
  const observed: unknown[] = [];
  world[$internal].settledSubscriptions.add(() => observed.push(source.targetFor(Link)));
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
    world[$internal].settledSubscriptions.add(() => {
      observed.push([parent.isAlive(), child.isAlive(), grandchild.isAlive()]);
      expect(world.query(ChildOf('*')).length).toBe(0);
    });
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
  world[$internal].settledSubscriptions.add(() => {
    observed.push([source.has(A), source.has(B), source.targetFor(Link), query.toArray()]);
  });
  source.add(A, B, Link(b));
  expect(observed).toEqual([[true, true, b, [source]]]);
});

it('includes subscriptions attached during structural callbacks', () => {
  const world = createWorld();
  const A = trait();
  const source = world.spawn(A);
  let present: boolean | undefined;
  source.onRemove(A, () => {
    world[$internal].settledSubscriptions.add(() => {
      present = source.has(A);
    });
  });
  source.remove(A);
  expect(present).toBe(false);
});

it('keeps worlds independent and supports unsubscribe', () => {
  const left = createWorld();
  const right = createWorld();
  let calls = 0;
  const notify = () => calls++;
  left[$internal].settledSubscriptions.add(notify);
  right.spawn();
  expect(calls).toBe(0);
  left.spawn();
  expect(calls).toBe(1);
  left[$internal].settledSubscriptions.delete(notify);
  left.spawn();
  expect(calls).toBe(1);
});

it('processes structural work from settled callbacks without recursive notification', () => {
  const world = createWorld();
  const A = trait();
  const source = world.spawn();
  let inside = false;
  const observed: boolean[] = [];
  world[$internal].settledSubscriptions.add(() => {
    expect(inside).toBe(false);
    inside = true;
    observed.push(source.has(A));
    if (!source.has(A)) source.add(A);
    inside = false;
  });
  world.spawn();
  expect(observed).toEqual([false, true]);
});

it('restores the lifecycle after a throwing removal callback', () => {
  const world = createWorld();
  const A = trait();
  const source = world.spawn(A);
  let calls = 0;
  world[$internal].settledSubscriptions.add(() => calls++);
  const off = source.onRemove(A, () => {
    throw new Error('stop');
  });
  expect(() => source.remove(A)).toThrow('stop');
  expect(calls).toBe(0);
  expect(world[$internal].structuralDepth).toBe(0);
  off();
  source.remove(A);
  expect(calls).toBe(1);
});

it('restores notification after a settled subscriber throws', () => {
  const world = createWorld();
  const notify = () => {
    throw new Error('stop');
  };
  world[$internal].settledSubscriptions.add(notify);
  expect(() => world.spawn()).toThrow('stop');
  expect(world[$internal].structuralDepth).toBe(0);
  expect(world[$internal].isSettling).toBe(false);
  world[$internal].settledSubscriptions.delete(notify);
  expect(() => world.spawn()).not.toThrow();
});

it('settles reset after replacing the world entity and running reset subscribers', () => {
  const world = createWorld();
  const source = world.spawn();
  const before = world[$internal].worldEntity;
  let reset = false;
  const observed: boolean[][] = [];
  world[$internal].resetSubscriptions.add(() => {
    reset = true;
  });
  world[$internal].settledSubscriptions.add(() => {
    observed.push([source.isAlive(), world[$internal].worldEntity !== before, reset]);
  });
  world.reset();
  expect(observed).toEqual([[false, true, true]]);
});

it('does not emit structural settlement for ordinary value writes', () => {
  const world = createWorld();
  const Value = trait({ value: 0 });
  const source = world.spawn(Value);
  let calls = 0;
  world[$internal].settledSubscriptions.add(() => calls++);
  source.set(Value, { value: 1 });
  source.changed(Value);
  expect(calls).toBe(0);
});

it('settles ordered clear after removing every relation and updating the owned sequence', () => {
  const world = createWorld();
  const Children = ordered(relation());
  const parent = world.spawn(Children);
  const children = parent.get(Children)!;
  const a = world.spawn();
  const b = world.spawn();
  children.add(a).add(b);
  const observed: unknown[] = [];
  world[$internal].settledSubscriptions.add(() => observed.push(children.toArray()));
  children.clear();
  expect(observed).toEqual([[]]);
});

it('settles lazy world registration after the world entity is available', () => {
  const world = createWorld();
  const observed: boolean[] = [];
  world[$internal].settledSubscriptions.add(() => {
    observed.push(world[$internal].worldEntity.isAlive());
  });
  world.query();
  expect(observed).toEqual([true]);
});
