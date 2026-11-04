import { describe, expect, it } from 'vitest';
import { Not, createAdded, createRemoved, createWorld, relation, trait } from '../src';

const Position = trait({ x: 0, y: 0 });
const IsHot = trait();
const IsCold = trait();

describe('Entity retention', () => {
  it('sets the history window at creation without initializing the world', () => {
    expect(createWorld().retain).toBe(1024);
    const world = createWorld({ retain: 8 });
    expect(world.retain).toBe(8);
    expect(world.isRegistered).toBe(false);
  });

  it('keeps the creation policy fixed independently of the options object and reset', () => {
    const options = { retain: 8 };
    const world = createWorld(options);
    options.retain = 0;
    expect(() => {
      // @ts-expect-error The creation policy is read-only.
      world.retain = 0;
    }).toThrow(TypeError);

    world.spawn(Position).destroy();
    world.reset();
    expect(world.retain).toBe(8);
    const entity = world.spawn(Position);
    entity.destroy();
    expect(world.spawn().id()).not.toBe(entity.id());
  });

  it('protects pending and exposed batches with a zero history window', () => {
    const world = createWorld({ retain: 0 });
    const Removed = createRemoved();
    world.query(Removed(Position));
    const first = world.spawn(Position({ x: 1 }));
    first.destroy();
    expect(world.query(Removed(Position)).toArray()).toEqual([first]);
    const second = world.spawn(Position({ x: 2 }));
    second.destroy();

    expect(world.spawn().id()).not.toBe(first.id());
    expect(first.get(Position)!.x).toBe(1);
    expect(world.query(Removed(Position)).toArray()).toEqual([second]);
    expect(world.spawn().id()).toBe(first.id());
    expect(() => first.get(Position)).toThrow();
    expect(world.spawn().id()).not.toBe(second.id());
    expect(second.get(Position)!.x).toBe(2);
    world.query(Removed(Position));
    expect(world.spawn().id()).toBe(second.id());
  });

  it.each([-1, 1.5, NaN, Infinity])('rejects an invalid history window: %s', (retain) => {
    expect(() => createWorld({ retain })).toThrow(RangeError);
  });

  it('keeps a destroyed entity readable until its id is reused', () => {
    const world = createWorld({ retain: 1 });
    const Removed = createRemoved();
    world.query(Removed(Position));

    const entity = world.spawn(Position({ x: 1 }), IsHot);
    entity.destroy();

    expect(entity.isAlive()).toBe(false);
    expect(world.has(entity)).toBe(false);
    expect(world.entities).not.toContain(entity);
    expect(world.query(Position).length).toBe(0);
    expect(entity.has(Position)).toBe(true);
    expect(entity.get(Position)).toEqual({ x: 1, y: 0 });
    expect(() => entity.set(Position, { x: 2 })).toThrow();
    expect(() => entity.add(IsCold)).toThrow();
    expect(() => entity.remove(IsHot)).toThrow();
    expect(() => entity.destroy()).toThrow();

    // Within the window the id is not reused, so a spawn takes a fresh one.
    const fresh = world.spawn();
    expect(fresh.id()).not.toBe(entity.id());
    expect(entity.get(Position)).toEqual({ x: 1, y: 0 });

    // A second destroy puts the first past the window, but the reader has not moved past it.
    const second = world.spawn(Position({ x: 2 }));
    second.destroy();
    expect(world.query(Removed(Position)).toArray()).toEqual([entity, second]);
    expect(world.spawn().id()).not.toBe(entity.id());

    // The reader's second run moves past both, and the oldest id is reused first.
    expect(world.query(Removed(Position)).length).toBe(0);
    expect(world.spawn().id()).toBe(entity.id());
    expect(() => entity.get(Position)).toThrow();
    expect(second.get(Position)!.x).toBe(2);
  });

  it('reuses an unobserved destroy on the next spawn with a zero history window', () => {
    const world = createWorld({ retain: 0 });
    const entity = world.spawn(Position({ x: 1 }));
    entity.destroy();

    expect(entity.get(Position)!.x).toBe(1);
    expect(world.spawn().id()).toBe(entity.id());
    expect(() => entity.get(Position)).toThrow();
  });

  it('reuses the oldest id past the window when nothing reads', () => {
    const world = createWorld({ retain: 2 });
    const a = world.spawn(Position({ x: 1 }));
    const b = world.spawn(Position({ x: 2 }));
    const c = world.spawn(Position({ x: 3 }));
    a.destroy();
    b.destroy();
    c.destroy();

    expect(a.get(Position)!.x).toBe(1);
    const reused = world.spawn(Position({ x: 4 }));
    expect(reused.id()).toBe(a.id());
    expect(reused).not.toBe(a);
    expect(() => a.get(Position)).toThrow();
    expect(b.get(Position)!.x).toBe(2);
    expect(c.get(Position)!.x).toBe(3);
    expect(world.spawn().id()).not.toBe(b.id());
  });

  it('keeps unread removals beyond the history window', () => {
    const world = createWorld({ retain: 1 });
    const Removed = createRemoved();
    world.query(Removed(Position));

    const first = world.spawn(Position({ x: 42 }));
    first.destroy();
    for (let i = 0; i < 16; i++) world.spawn(Position).destroy();

    expect(world.spawn().id()).not.toBe(first.id());
    const removed = world.query(Removed(Position));
    expect(removed.length).toBe(17);
    expect(removed.first).toBe(first);
    expect(first.get(Position)!.x).toBe(42);
    expect(world.spawn().id()).not.toBe(first.id());
    world.query(Removed(Position));
    expect(world.spawn().id()).toBe(first.id());
  });

  it.each([0, 1])('waits for every matching reader with a history window of %s', (retain) => {
    const world = createWorld({ retain });
    const RemovedA = createRemoved();
    const RemovedB = createRemoved();
    const Unrelated = createRemoved();
    world.query(RemovedA(Position));
    world.query(RemovedB(Position), IsHot);
    world.query(Unrelated(IsCold));

    const entity = world.spawn(Position({ x: 42 }), IsHot);
    entity.destroy();
    world.spawn().destroy();

    expect(world.query(RemovedA(Position)).toArray()).toEqual([entity]);
    world.query(RemovedA(Position));
    expect(world.spawn().id()).not.toBe(entity.id());

    world.query(RemovedB(Position), IsHot).each((position, removed) => {
      expect(removed).toBe(entity);
      expect(position.x).toBe(42);
      expect(world.spawn().id()).not.toBe(entity.id());
    });
    expect(world.spawn().id()).not.toBe(entity.id());

    world.query(RemovedB(Position), IsHot);
    expect(world.spawn().id()).toBe(entity.id());
  });

  it('releases a pending removal when the entity stops matching', () => {
    const world = createWorld({ retain: 1 });
    const Removed = createRemoved();
    world.query(Removed(Position), IsHot);
    const entity = world.spawn(Position, IsHot);
    entity.remove(Position);
    entity.remove(IsHot);
    entity.destroy();
    world.spawn().destroy();

    expect(world.query(Removed(Position), IsHot).length).toBe(0);
    expect(world.spawn().id()).toBe(entity.id());
  });

  it('holds an entity that occurs in both the exposed and pending batches', () => {
    const world = createWorld({ retain: 1 });
    const Removed = createRemoved();
    world.query(Removed(Position));
    const entity = world.spawn(Position({ x: 1 }));
    entity.remove(Position);
    expect(world.query(Removed(Position)).toArray()).toEqual([entity]);
    entity.add(Position({ x: 2 }));
    entity.remove(Position);
    entity.destroy();
    world.spawn().destroy();

    expect(world.query(Removed(Position)).toArray()).toEqual([entity]);
    expect(world.spawn().id()).not.toBe(entity.id());
    expect(entity.get(Position)!.x).toBe(2);
    world.query(Removed(Position));
    expect(world.spawn().id()).toBe(entity.id());
  });

  it.each([false, true])('releases a dropped query with an exposed batch: %s', (expose) => {
    const world = createWorld({ retain: 1 });
    const ChildOf = relation();
    const Removed = createRemoved();
    const target = world.spawn();
    world.query(Removed(Position), ChildOf(target));
    const entity = world.spawn(Position, ChildOf(target));
    entity.destroy();
    if (expose) world.query(Removed(Position), ChildOf(target));
    target.destroy();

    expect(world.spawn().id()).toBe(entity.id());
  });

  it.each(['remove', 'destroy'] as const)(
    'reads data on the first tick when %s happened before query registration',
    (operation) => {
      const world = createWorld();
      const entity = world.spawn(Position({ x: 42 }));
      if (operation === 'remove') entity.remove(Position);
      else entity.destroy();

      const Removed = createRemoved();
      const values: number[] = [];
      world.query(Removed(Position)).each((position, removed) => {
        expect(removed).toBe(entity);
        values.push(position.x);
      });
      expect(values).toEqual([42]);
      expect(world.query(Removed(Position)).length).toBe(0);
    }
  );

  it('lets a late reader claim zero-window history only until the id is reused', () => {
    const world = createWorld({ retain: 0 });
    const entity = world.spawn(Position({ x: 42 }));
    entity.destroy();

    const Removed = createRemoved();
    expect(world.query(Removed(Position)).toArray()).toEqual([entity]);
    expect(world.spawn().id()).not.toBe(entity.id());
    expect(entity.get(Position)!.x).toBe(42);
    world.query(Removed(Position));
    expect(world.spawn().id()).toBe(entity.id());

    expect(world.query(createRemoved()(Position)).length).toBe(0);
  });

  it('protects a late reader while its batch is being walked', () => {
    const world = createWorld({ retain: 1 });
    const entities = [world.spawn(Position({ x: 1 })), world.spawn(Position({ x: 2 }))];
    for (const entity of entities) entity.destroy();

    const Removed = createRemoved();
    const values: number[] = [];
    world.query(Removed(Position)).each((position) => {
      world.query(Removed(Position));
      expect(world.spawn().id()).not.toBe(entities[0].id());
      values.push(position.x);
    });
    expect(values).toEqual([1, 2]);
    world.query(Removed(Position));
    expect(world.spawn().id()).toBe(entities[0].id());
  });

  it('seeds a Removed query created after a destroy in destroy order', () => {
    const world = createWorld();
    const kept = world.spawn(Position({ x: 1 }));
    const first = world.spawn(Position({ x: 2 }));
    const second = world.spawn(Position({ x: 3 }));
    second.destroy();
    first.destroy();

    const Removed = createRemoved();
    const removed = world.query(Removed(Position));
    expect(removed.toArray()).toEqual([second, first]);
    removed.forEach((entity) => expect(entity.get(Position)!.x).toBeGreaterThan(1));
    expect(world.query(Removed(Position)).length).toBe(0);
    expect(kept.isAlive()).toBe(true);
  });

  it('preserves destroy order and data after recycling and growing the history', () => {
    const world = createWorld({ retain: 2 });
    for (let x = 0; x < 21; x++) world.spawn(Position({ x })).destroy();
    const entities = Array.from({ length: 20 }, (_, i) => world.spawn(Position({ x: i + 21 })));
    for (const entity of entities) entity.destroy();

    const Removed = createRemoved();
    const values: number[] = [];
    world.query(Removed(Position)).each((position) => values.push(position.x));
    expect(values).toEqual(Array.from({ length: 22 }, (_, i) => i + 19));
  });

  it('does not seed an Added query from a destroyed entity', () => {
    const world = createWorld();
    world.spawn(Position).destroy();

    const Added = createAdded();
    expect(world.query(Added(Position)).length).toBe(0);
  });

  it('tracks destroys through Removed, told apart from live removes by liveness', () => {
    const world = createWorld();
    const Removed = createRemoved();
    expect(world.query(Removed(Position)).length).toBe(0);

    const held = world.spawn(Position({ x: 3 }));
    const dropped = world.spawn(Position({ x: 4 }));
    dropped.remove(Position);
    held.destroy();

    const removed = world.query(Removed(Position));
    expect(removed.toArray()).toEqual([dropped, held]);
    expect(removed.toArray().map((entity) => entity.isAlive())).toEqual([true, false]);
    expect(removed.toArray().map((entity) => entity.get(Position)!.x)).toEqual([4, 3]);
    expect(world.query(Removed(Position)).length).toBe(0);
  });

  it('reads the last value of a removed trait until it is added back', () => {
    const world = createWorld();
    const Removed = createRemoved();
    world.query(Removed(Position));
    const entity = world.spawn(Position({ x: 5 }));

    entity.remove(Position);
    expect(entity.has(Position)).toBe(false);
    expect(entity.get(Position)).toEqual({ x: 5, y: 0 });
    expect(world.query(Removed(Position)).toArray()).toEqual([entity]);

    entity.remove(Position);
    entity.add(Position({ x: 7 }));
    expect(entity.get(Position)!.x).toBe(7);
    expect(world.query(Removed(Position)).length).toBe(0);
  });

  it('matches the other terms of a Removed query on what a destroyed entity died with', () => {
    const world = createWorld();
    const Warm = createRemoved();
    world.query(Warm(Position), IsHot);
    const hot = world.spawn(Position, IsHot);
    const cold = world.spawn(Position, IsCold);
    hot.destroy();
    cold.destroy();

    expect(world.query(Warm(Position), IsHot).toArray()).toEqual([hot]);
    expect(world.query(createRemoved()(Position), IsHot).toArray()).toEqual([hot]);
    expect(world.query(createRemoved()(Position), Not(IsHot)).toArray()).toEqual([cold]);
  });

  it('keeps alive and destroyed entities apart while spawning', () => {
    const world = createWorld();
    const a = world.spawn(Position({ x: 1 }));
    const b = world.spawn(Position({ x: 2 }));
    const c = world.spawn(Position({ x: 3 }));
    a.destroy();
    b.destroy();
    const d = world.spawn(Position({ x: 4 }));
    const e = world.spawn(Position({ x: 5 }));

    expect(world.query(Position).toArray().sort()).toEqual([c, d, e].sort());
    expect(a.get(Position)!.x).toBe(1);
    expect(b.get(Position)!.x).toBe(2);

    const Removed = createRemoved();
    expect(world.query(Removed(Position)).toArray()).toEqual([a, b]);
    expect(world.query(Removed(Position)).length).toBe(0);
    expect(world.query(Position).length).toBe(3);
  });

  it('releases destroyed entities on reset', () => {
    const world = createWorld();
    const entity = world.spawn(Position);
    entity.destroy();
    world.reset();

    const replacement = world.spawn(Position({ x: 9 }));
    expect(replacement.id()).toBe(entity.id());
    expect(entity.isAlive()).toBe(false);
    expect(() => entity.get(Position)).toThrow();
    expect(world.query(Position).toArray()).toEqual([replacement]);
  });

  it('applies the creation policy to later world traits and queries', () => {
    const world = createWorld({ retain: 0 });
    world.add(Position({ x: 9 }));
    const Removed = createRemoved();
    world.query(Removed(Position));
    expect(world.get(Position)?.x).toBe(9);
    const entity = world.spawn(Position);
    entity.destroy();
    expect(world.query(Removed(Position)).toArray()).toEqual([entity]);
    expect(world.spawn().id()).not.toBe(entity.id());
    world.query(Removed(Position));
    expect(world.spawn().id()).toBe(entity.id());
    expect(() => entity.get(Position)).toThrow();
  });
});

const ChildOf = relation({ autoDestroy: 'orphan' });
const Likes = relation();
const Weighs = relation({ store: { kg: 0 } });

describe('Relation retention', () => {
  it('matches Removed queries on the pairs held at destroy, warm and cold', () => {
    const world = createWorld();
    const a = world.spawn();
    const b = world.spawn();
    const childA = world.spawn(Likes(a));
    const childB = world.spawn(Likes(b));
    const Warm = createRemoved();
    expect(world.query(Warm(Likes), Likes(a)).length).toBe(0);

    childA.destroy();
    childB.destroy();

    expect(world.query(Warm(Likes), Likes(a)).toArray()).toEqual([childA]);
    expect(world.query(createRemoved()(Likes), Likes(a)).toArray()).toEqual([childA]);
    expect(world.query(createRemoved()(Likes), Likes('*')).toArray()).toEqual([childA, childB]);
  });

  it.each([0, 1024])(
    'keeps targets and pair data readable on a destroyed entity, retain %s',
    (retain) => {
      const world = createWorld({ retain });
      const a = world.spawn();
      const b = world.spawn();
      const entity = world.spawn(Weighs(a, { kg: 7 }), Weighs(b, { kg: 9 }));
      entity.destroy();

      expect(entity.targetsFor(Weighs)).toEqual([a, b]);
      expect(entity.targetFor(Weighs)).toBe(a);
      expect(entity.has(Weighs(b))).toBe(true);
      expect(entity.get(Weighs(b))).toEqual({ kg: 9 });
      expect(world.query(Weighs(a)).length).toBe(0);
      expect(() => entity.remove(Weighs(a))).toThrow();
    }
  );

  it.each([0, 1024])('keeps the parent on children destroyed with it, retain %s', (retain) => {
    const world = createWorld({ retain });
    const parent = world.spawn();
    const child = world.spawn(ChildOf(parent));
    parent.destroy();

    expect(world.has(child)).toBe(false);
    expect(child.targetFor(ChildOf)).toBe(parent);
    expect(world.query(createRemoved()(ChildOf), ChildOf(parent)).toArray()).toEqual([child]);
  });

  it('drops the pair from a live source when its target dies', () => {
    const world = createWorld();
    const target = world.spawn();
    const source = world.spawn(Likes(target));
    target.destroy();

    expect(source.has(Likes('*'))).toBe(false);
    expect(source.targetFor(Likes)).toBeUndefined();
  });

  it('clears relation data when the id is reused', () => {
    const world = createWorld({ retain: 1 });
    const a = world.spawn();
    const first = world.spawn(Weighs(a, { kg: 7 }));
    const second = world.spawn(Weighs(a, { kg: 8 }));
    first.destroy();
    second.destroy();

    const reused = world.spawn();
    expect(reused.id()).toBe(first.id());
    expect(reused.has(Weighs('*'))).toBe(false);
    expect(reused.targetsFor(Weighs)).toEqual([]);
    expect(second.get(Weighs(a))).toEqual({ kg: 8 });

    reused.add(Weighs(a, { kg: 1 }));
    expect(reused.targetsFor(Weighs)).toEqual([a]);
    expect(reused.get(Weighs(a))).toEqual({ kg: 1 });
  });
});
