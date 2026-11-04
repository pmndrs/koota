import { describe, expect, it } from 'vitest';
import { Name, Not, createAdded, createRemoved, createWorld, relation, trait } from '../src';
import { hasNativeGc, waitForFinalization } from './utils/gc';

const Position = trait({ x: 0, y: 0 });
const IsHot = trait();
const IsCold = trait();

describe('Entity retention', () => {
  it('sets the retention cap at creation without initializing the world', () => {
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

  it.each([-1, 1.5, NaN, Infinity])('rejects an invalid retention cap: %s', (retain) => {
    expect(() => createWorld({ retain })).toThrow(RangeError);
  });

  it('disables destroyed history at zero while preserving live trait removals', () => {
    const world = createWorld({ retain: 0 });
    const Removed = createRemoved();
    const entity = world.spawn(Position({ x: 42 }));
    entity.remove(Position);
    const view = world.query(Removed(Position));
    expect(view.toArray()).toEqual([entity]);
    expect(entity.get(Position)!.x).toBe(42);

    entity.destroy();
    expect(view.length).toBe(0);
    expect(world.query(Removed(Position)).length).toBe(0);
    expect(world.query(createRemoved()(Position)).length).toBe(0);
    expect(() => entity.get(Position)).toThrow();
    expect(world.spawn().id()).toBe(entity.id());
  });

  it('keeps destroyed entities readable until the oldest exceeds the cap', () => {
    const world = createWorld({ retain: 1 });
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
    expect(world.spawn().id()).not.toBe(entity.id());

    const second = world.spawn(Position({ x: 2 }));
    second.destroy();
    expect(() => entity.get(Position)).toThrow();
    expect(world.query(createRemoved()(Position)).toArray()).toEqual([second]);
    expect(world.spawn().id()).toBe(entity.id());
    expect(second.get(Position)!.x).toBe(2);
  });

  it.each([false, true])('caps history without needing a spawn or reader, registered: %s', (warm) => {
    const world = createWorld({ retain: 3 });
    const Removed = createRemoved();
    if (warm) world.query(Removed(Position));
    const entities = Array.from({ length: 20 }, (_, x) => world.spawn(Position({ x })));
    for (const entity of entities) entity.destroy();

    for (const entity of entities.slice(0, -3)) expect(() => entity.get(Position)).toThrow();
    const values: number[] = [];
    world.query(Removed(Position)).each((position) => values.push(position.x));
    expect(values.sort((a, b) => a - b)).toEqual([17, 18, 19]);
    expect(world.query(Removed(Position)).length).toBe(0);
    expect(world.query(createRemoved()(Position)).toArray()).toEqual(entities.slice(-3));
  });

  it('gives readers independent batches within the cap and evicts exposed data on overflow', () => {
    const world = createWorld({ retain: 2 });
    const Fast = createRemoved();
    const Slow = createRemoved();
    world.query(Fast(Position));
    world.query(Slow(Position));
    const first = world.spawn(Position({ x: 1 }));
    first.destroy();
    const exposed = world.query(Fast(Position));
    expect(exposed.toArray()).toEqual([first]);
    expect(world.query(Slow(Position)).toArray()).toEqual([first]);
    world.query(Fast(Position));
    expect(first.get(Position)!.x).toBe(1);

    const second = world.spawn(Position({ x: 2 }));
    second.destroy();
    const slow = world.query(Slow(Position));
    expect(slow.toArray()).toEqual([second]);
    const third = world.spawn(Position({ x: 3 }));
    third.destroy();
    expect(() => first.get(Position)).toThrow();
    expect(world.query(Fast(Position)).toArray()).toEqual([second, third]);
    expect(slow.toArray()).toEqual([second]);
    world.spawn().destroy();
    expect(slow.length).toBe(0);
  });

  it('recycles a bounded set of ids even when a reader never runs again', () => {
    const world = createWorld({ retain: 3 });
    const Removed = createRemoved();
    world.query(Removed(Position));
    const ids = new Set<number>();
    for (let x = 0; x < 2000; x++) {
      const entity = world.spawn(Position({ x }));
      ids.add(entity.id());
      entity.destroy();
    }
    expect(ids.size).toBe(4);
    const values: number[] = [];
    world.query(Removed(Position)).each((position) => values.push(position.x));
    expect(values.sort((a, b) => a - b)).toEqual([1997, 1998, 1999]);
  });

  it('evicts a removal present in both pending and exposed batches', () => {
    const world = createWorld({ retain: 1 });
    const Removed = createRemoved();
    const entity = world.spawn(Position({ x: 1 }));
    entity.remove(Position);
    const exposed = world.query(Removed(Position));
    entity.add(Position({ x: 2 }));
    entity.remove(Position);
    entity.destroy();
    world.spawn().destroy();

    expect(exposed.length).toBe(0);
    expect(world.query(Removed(Position)).length).toBe(0);
    expect(world.spawn().id()).toBe(entity.id());
  });

  it.each([false, true])('clears partial removal history before id reuse, named: %s', (named) => {
    const world = createWorld({ retain: 1 });
    const Removed = createRemoved();
    const params = [Removed(Position, IsHot), ...(named ? [Name('target')] : [])];
    world.query(...params);
    const first = world.spawn(Position, IsHot, Name('target'));
    first.remove(Position);
    first.destroy();
    world.spawn().destroy();

    const replacement = world.spawn(Position, IsHot, Name('target'));
    expect(replacement.id()).toBe(first.id());
    expect(world.query(...params).length).toBe(0);
    replacement.remove(Position);
    expect(world.query(...params).length).toBe(0);
    replacement.remove(IsHot);
    expect(world.query(...params).toArray()).toEqual([replacement]);
  });

  it.each(['soa', 'aos'] as const)(
    'skips evicted %s entries during a walk without skipping retained ones',
    (kind) => {
      const Value = kind === 'soa' ? trait({ value: 0 }) : trait(() => ({ value: 0 }));
      const world = createWorld({ retain: 3 });
      const entities = [1, 2, 3].map((value) => world.spawn(Value({ value })));
      for (const entity of entities) entity.destroy();
      const Removed = createRemoved();
      const values: number[] = [];
      world.query(Removed(Value)).each((value, _entity, _index) => {
        values.push(value.value);
        if (values.length === 1) {
          world.spawn(Value({ value: 4 })).destroy();
          world.spawn(Value({ value: 5 })).destroy();
          expect(world.query(Removed(Value)).toArray()).toEqual([entities[2]]);
        }
      });
      expect(values).toEqual([1, 3]);
      world.destroy();
    }
  );

  it.each(['forEach', 'iterator'] as const)('skips evicted handles during %s', (method) => {
    const world = createWorld({ retain: 3 });
    const entities = [1, 2, 3].map((x) => world.spawn(Position({ x })));
    for (const entity of entities) entity.destroy();
    const view = world.query(createRemoved()(Position));
    const values: number[] = [];
    const visit = (entity: (typeof entities)[number]) => {
      values.push(entity.get(Position)!.x);
      if (values.length === 1) {
        world.spawn().destroy();
        world.spawn().destroy();
      }
    };
    if (method === 'forEach') view.forEach(visit);
    else for (const entity of view) visit(entity);
    expect(values).toEqual([1, 3]);
  });

  it.skipIf(!hasNativeGc()).each(['soa', 'aos'] as const)(
    'releases evicted %s object data while the world and slow reader stay alive',
    async (kind) => {
      const Value = kind === 'soa' ? trait({ payload: () => ({}) }) : trait(() => ({ payload: {} }));
      const world = createWorld({ retain: 1 });
      const Removed = createRemoved();
      world.query(Removed(Value));
      await expect(
        waitForFinalization((registry) => {
          const entity = world.spawn(Value);
          const value = entity.get(Value)!;
          registry.register(value.payload, 'payload');
          entity.remove(Value);
          entity.destroy();
          world.spawn().destroy();
        })
      ).resolves.toBe(true);
      expect(world.query(Removed(Value)).length).toBe(0);
      expect(world.isRegistered).toBe(true);
      world.destroy();
    }
  );

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

  it('keeps a late reader readable while spawning within the cap', () => {
    const world = createWorld({ retain: 2 });
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
    world.spawn().destroy();
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

  it('preserves late-reader destroy order after the retention ring wraps', () => {
    const world = createWorld({ retain: 2 });
    for (let x = 0; x < 21; x++) world.spawn(Position({ x })).destroy();
    const entities = Array.from({ length: 20 }, (_, i) => world.spawn(Position({ x: i + 21 })));
    for (const entity of entities) entity.destroy();

    const Removed = createRemoved();
    const values: number[] = [];
    world.query(Removed(Position)).each((position) => values.push(position.x));
    expect(values).toEqual([39, 40]);
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
    expect(world.query(Removed(Position)).length).toBe(0);
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

  it.each([1, 1024])(
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

  it.each([1, 1024])('keeps the parent on children destroyed with it, retain %s', (retain) => {
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
