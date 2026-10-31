import { beforeEach, describe, expect, it } from 'vitest';
import { createAdded, createQuery, createWorld, type Entity, trait } from '../src';

const Position = trait({ x: 0, y: 0 });
const Name = trait({ name: '' });

describe('Live query results', () => {
  const world = createWorld();

  beforeEach(() => {
    world.reset();
  });

  it('returns the same array each run and reflects membership changes', () => {
    const first = world.spawn(Position);
    const result = world.query(Position);
    expect(world.query(Position)).toBe(result);

    const second = world.spawn(Position);
    expect([...result]).toEqual([first, second]);

    // Removals commit on the next run.
    first.remove(Position);
    world.query(Position);
    expect([...result]).toEqual([second]);

    const copy = result.toArray();
    expect(copy).not.toBe(result);
    expect(copy).toEqual([second]);
  });

  it('reads indexed entities with array at semantics and respects the live length', () => {
    const first = world.spawn(Position);
    const second = world.spawn(Position);
    const result = world.query(Position);
    const expected = [first, second];

    for (const index of [0, 1, -1, -2, 2, -3, 1.9, -1.9, NaN, Infinity, -Infinity]) {
      expect(result.at(index)).toBe(expected.at(index));
    }

    second.destroy();
    world.query(Position);
    expect(result.at(0)).toBe(first);
    expect(result.at(-1)).toBe(first);
    expect(result.at(1)).toBeUndefined();
    expect(result.at(-2)).toBeUndefined();

    first.destroy();
    world.query(Position);
    expect(result.at(0)).toBeUndefined();
    expect(result.at(-1)).toBeUndefined();
  });

  it('keeps the outer walk stable when a callback runs the same query', () => {
    const first = world.spawn(Position({ x: 1 }));
    const second = world.spawn(Position({ x: 2 }));
    const visited: Entity[] = [];
    let inner: Entity[] = [];
    let replacement!: Entity;

    world.query(Position).updateEach(([position], entity, index) => {
      visited.push(entity);
      position.x += 10;
      if (index !== 0) return;
      second.destroy();
      replacement = world.spawn(Position({ x: 7 }));
      inner = [...world.query(Position)];
    });

    // The starting membership is walked once, the nested run skips the pending removal and the
    // replacement waits for the next run.
    expect(visited).toEqual([first, second]);
    expect(inner).toEqual([first, replacement]);
    expect(first.get(Position)?.x).toBe(11);
    expect(replacement.get(Position)?.x).toBe(7);
    expect([...world.query(Position)]).toEqual([first, replacement]);
  });

  it('excludes an entity whose trait was removed from a nested run', () => {
    const first = world.spawn(Position({ x: 1 }));
    const second = world.spawn(Position({ x: 2 }));
    const inner: [Entity, number][] = [];

    world.query(Position).updateEach((_, entity) => {
      if (entity !== first) return;
      second.remove(Position);
      world.query(Position).readEach(([position], entity) => inner.push([entity, position.x]));
    });

    expect(inner).toEqual([[first, 1]]);
    expect([...world.query(Position)]).toEqual([first]);
  });

  it('walks the membership present when a for of loop starts', () => {
    const first = world.spawn(Position);
    const second = world.spawn(Position);
    const visited: Entity[] = [];

    for (const entity of world.query(Position)) {
      visited.push(entity);
      if (entity === first) {
        second.destroy();
        world.spawn(Position);
      }
    }

    expect(visited).toEqual([first, second]);
  });

  it('releases the iteration guard when a for of loop breaks', () => {
    const first = world.spawn(Position);
    const second = world.spawn(Position);

    for (const entity of world.query(Position)) {
      entity.destroy();
      break;
    }

    expect(first.isAlive()).toBe(false);
    expect([...world.query(Position)]).toEqual([second]);
  });

  it('skips pending removals in queryFirst during a walk', () => {
    const first = world.spawn(Position);
    const second = world.spawn(Position);
    let found: Entity | undefined;

    world.query(Position).readEach((_, entity) => {
      if (entity !== first) return;
      first.remove(Position);
      found = world.queryFirst(Position);
    });

    expect(found).toBe(second);
    expect(world.queryFirst(Position)).toBe(second);
  });

  it('caches selections and copies runs that reorder the traits', () => {
    const entity = world.spawn(Position({ x: 1 }), Name({ name: 'a' }));
    const result = world.query(Position, Name);
    const selected = result.select(Name);
    selected.readEach((state) => expect(state).toHaveLength(1));
    expect(world.query(Position, Name).select(Name)).toBe(selected);
    result.readEach((state) => expect(state).toHaveLength(2));

    // Another trait order would rebind the shared array, so it gets a bound copy instead.
    const reordered = world.query(Name, Position);
    expect(reordered).not.toBe(result);
    expect([...reordered]).toEqual([entity]);
    reordered.readEach(([name, position]) => {
      expect(name.name).toBe('a');
      expect(position.x).toBe(1);
    });
    result.readEach(([position, name]) => {
      expect(position.x).toBe(1);
      expect(name.name).toBe('a');
    });
  });

  it('keeps a tracking batch readable until the next run', () => {
    const Added = createAdded();
    const first = world.spawn(Position);
    const batch = world.query(Added(Position));
    expect([...batch]).toEqual([first]);

    // Later events collect in the next batch.
    const second = world.spawn(Position);
    expect([...batch]).toEqual([first]);

    // The same view follows the batch each run exposes.
    const next = world.query(Added(Position));
    expect(next).toBe(batch);
    expect([...next]).toEqual([second]);
    expect(world.query(Added(Position))).toHaveLength(0);
  });

  it('pages each tracking batch as it is exposed', () => {
    const Added = createAdded();
    const first = world.spawn(Position);
    const batch = world.query(Added(Position));
    expect(batch.getPages()[0].entities).toEqual([first]);
    expect(batch.getPages()[0].entities).toEqual([first]);

    const second = world.spawn(Position);
    world.query(Added(Position));
    expect(batch.getPages()[0].entities).toEqual([second]);
    world.query(Added(Position));
    expect(batch.getPages()).toHaveLength(0);
  });

  it('discards tracking pages when a cleared batch is reused', () => {
    const Added = createAdded();
    const query = createQuery(Added(Position));
    const first = world.spawn(Position);
    const batch = world.query(query);
    const pages = batch.getPages();
    expect(pages[0].entities).toEqual([first]);
    expect(batch.getPages()).toBe(pages);

    world.query(query);
    const empty = world.query(query);
    expect(empty).toHaveLength(0);
    expect(empty.getPages()).toHaveLength(0);

    const second = world.spawn(Position);
    expect(world.query(query).getPages()[0].entities).toEqual([second]);
  });

  it('keeps the tracking batch when a callback runs the same tracking query', () => {
    const Added = createAdded();
    const first = world.spawn(Position);
    const second = world.spawn(Position);
    const visited: Entity[] = [];
    let nested = 0;

    world.query(Added(Position)).readEach((_, entity) => {
      visited.push(entity);
      nested = world.query(Added(Position)).length;
    });

    expect(visited).toEqual([first, second]);
    expect(nested).toBe(2);
    expect(world.query(Added(Position))).toHaveLength(0);
  });

  it('copies into a plain array that does not follow the query', () => {
    const first = world.spawn(Position({ x: 1 }));
    const second = world.spawn(Position({ x: 2 }));
    const copy = world.query(Position).toArray();
    expect(Array.isArray(copy)).toBe(true);
    expect(copy).toEqual([first, second]);

    world.spawn(Position({ x: 3 }));
    expect(copy).toHaveLength(2);
    expect(world.query(Position)).toHaveLength(3);

    // Sorting the copy leaves the live view in the query's order.
    expect(copy.sort((a, b) => b - a)).toEqual([second, first]);
    expect(world.query(Position).first).toBe(first);
  });

  it('visits every entity with forEach while destroying inside the callback', () => {
    const first = world.spawn(Position({ x: 1 }));
    const second = world.spawn(Position({ x: 2 }));
    const third = world.spawn(Position({ x: 3 }));
    const visited: number[] = [];

    world.query(Position).forEach((entity, index) => {
      visited.push(entity);
      if (index === 0) second.destroy();
    });

    expect(visited).toEqual([first, second, third]);
    expect(world.query(Position).toArray()).toEqual([first, third]);
  });
});
