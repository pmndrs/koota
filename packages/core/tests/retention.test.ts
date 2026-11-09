import { describe, expect, it } from 'vitest';
import { Not, createRemoved, identifier, relation, trait } from '../src';
import { createWorld } from '../src/entity-methods';
import { hasNativeGc, waitForFinalization } from './utils/gc';

const Position = trait({ x: 0, y: 0 });
const IsHot = trait();
const IsCold = trait();
const Name = identifier();

describe('Entity retention', () => {
  it('sets a fixed retention cap at creation', () => {
    expect(createWorld().retain).toBe(1024);
    const options = { retain: 8 };
    const world = createWorld(options);
    options.retain = 0;
    expect(world.retain).toBe(8);
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

  it.each([-1, 1.5])('rejects an invalid retention cap: %s', (retain) => {
    expect(() => createWorld({ retain })).toThrow(RangeError);
  });

  it('disables destroyed history at zero while preserving live trait removals', () => {
    const world = createWorld({ retain: 0 });
    world.add(Position({ x: 9 }));
    expect(world.get(Position)?.x).toBe(9);
    const Removed = createRemoved();
    const entity = world.spawn(Position({ x: 42 }));
    entity.remove(Position);
    const view = world.query(Removed(Position));
    expect(view.toArray()).toEqual([entity]);
    expect(entity.get(Position)).toBeUndefined();
    view.each((position) => expect(position.x).toBe(42));

    entity.destroy();
    expect(view.length).toBe(0);
    expect(world.query(Removed(Position)).length).toBe(0);
    expect(world.query(createRemoved()(Position)).length).toBe(0);
    expect(() => entity.get(Position)).toThrow();
    expect(world.spawn().id()).toBe(entity.id());
  });

  it.each([false, true])('caps history without needing a spawn or reader, registered: %s', (warm) => {
    const world = createWorld({ retain: 3 });
    const Removed = createRemoved();
    if (warm) world.query(Removed(Position));
    const entities = Array.from({ length: 20 }, (_, x) => world.spawn(Position({ x })));
    for (const entity of entities) entity.destroy();

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
    const values: number[] = [];
    world.query(Fast(Position)).each((position) => values.push(position.x));
    expect(values).toEqual([1]);
    expect(world.query(Fast(Position)).length).toBe(0);

    const second = world.spawn(Position({ x: 2 }));
    second.destroy();
    const slow = world.query(Slow(Position));
    expect(slow.toArray()).toEqual([first, second]);
    values.length = 0;
    slow.each((position) => values.push(position.x));
    expect(values).toEqual([1, 2]);
    const third = world.spawn(Position({ x: 3 }));
    third.destroy();
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
    for (let x = 0; x < 20; x++) {
      const entity = world.spawn(Position({ x }));
      ids.add(entity.id());
      entity.destroy();
    }
    expect(ids.size).toBe(4);
    const values: number[] = [];
    world.query(Removed(Position)).each((position) => values.push(position.x));
    expect(values.sort((a, b) => a - b)).toEqual([17, 18, 19]);
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

  it('clears partial removal history before a named entity id is reused', () => {
    const world = createWorld({ retain: 1 });
    const Removed = createRemoved();
    const params = [Removed(Position, IsHot), Name('target')];
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
    const visited: (typeof entities)[number][] = [];
    const visit = (entity: (typeof entities)[number]) => {
      visited.push(entity);
      if (visited.length === 1) {
        world.spawn().destroy();
        world.spawn().destroy();
      }
    };
    if (method === 'forEach') view.forEach(visit);
    else for (const entity of view) visit(entity);
    expect(visited).toEqual([entities[0], entities[2]]);
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
      world.destroy();
    }
  );

  it('reads first-tick removals and destroys once with their data in destroy order', () => {
    const world = createWorld();
    const live = world.spawn(Position({ x: 1 }));
    const first = world.spawn(Position({ x: 2 }));
    const second = world.spawn(Position({ x: 3 }));
    live.remove(Position);
    second.destroy();
    first.destroy();
    const kept = world.spawn(Position({ x: 4 }));

    expect(live.has(Position)).toBe(false);
    expect(live.get(Position)).toBeUndefined();
    const Removed = createRemoved();
    const removed = world.query(Removed(Position));
    expect(removed.toArray()).toEqual([live, second, first]);
    expect(removed.toArray().map((entity) => entity.isAlive())).toEqual([true, false, false]);
    const values: number[] = [];
    removed.each((position) => values.push(position.x));
    expect(values).toEqual([1, 3, 2]);
    expect(world.query(Removed(Position)).length).toBe(0);
    expect(world.query(Position).toArray()).toEqual([kept]);
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
});

const ChildOf = relation({ autoDestroy: 'orphan' });
const Likes = relation();
const Weighs = relation({ store: { kg: 0 } });

describe('Relation retention', () => {
  it.each([false, true])(
    'matches retained pairs in warm and cold queries, exclusive: %s',
    (exclusive) => {
      const Link = relation({ exclusive });
      const world = createWorld();
      const a = world.spawn();
      const b = world.spawn();
      const childA = world.spawn(Link(a));
      const childB = world.spawn(Link(b));
      const Warm = createRemoved();
      expect(world.query(Warm(Link), Link(a)).length).toBe(0);

      childA.destroy();
      childB.destroy();

      expect(world.query(Warm(Link), Link(a)).toArray()).toEqual([childA]);
      expect(world.query(createRemoved()(Link), Link(a)).toArray()).toEqual([childA]);
      expect(world.query(createRemoved()(Link), Link('*')).toArray()).toEqual([childA, childB]);
    }
  );

  it('keeps the parent on children destroyed with it at the retention cap', () => {
    const world = createWorld({ retain: 1 });
    const parent = world.spawn();
    const child = world.spawn(ChildOf(parent));
    parent.destroy();

    expect(world.has(child)).toBe(false);
    expect(() => child.targetFor(ChildOf)).toThrow(/\[ENTITY_ALIVE\]/);
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
    expect(world.query(createRemoved()(Weighs), Weighs(a)).toArray()).toEqual([second]);

    reused.add(Weighs(a, { kg: 1 }));
    expect(reused.targetsFor(Weighs)).toEqual([a]);
    expect(reused.get(Weighs(a))).toEqual({ kg: 1 });
  });
});
