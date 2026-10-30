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
      inner = [...world.query(Position)].filter((entity) => entity.isAlive());
    });

    // The starting membership is walked once and the replacement waits for the next run.
    expect(visited).toEqual([first, second]);
    expect(inner).toEqual([first, replacement]);
    expect(first.get(Position)?.x).toBe(11);
    expect(replacement.get(Position)?.x).toBe(7);
    expect([...world.query(Position)]).toEqual([first, replacement]);
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

  it('sorts into a copy that keeps the iteration methods', () => {
    const first = world.spawn(Position({ x: 1 }));
    const second = world.spawn(Position({ x: 2 }));
    const sorted = world.query(Position).sort((a, b) => b - a);
    expect([...sorted]).toEqual([second, first]);
    sorted.updateEach(([position]) => position.x++);
    expect(first.get(Position)?.x).toBe(2);
    expect(second.get(Position)?.x).toBe(3);
  });

  const runtime = globalThis as unknown as {
    gc?: () => void;
    process: { memoryUsage(): { heapUsed: number } };
  };

  it.skipIf(typeof runtime.gc !== 'function')('allocates nothing per run once warm', () => {
    for (let i = 0; i < 1000; i++) world.spawn(Position({ x: i }), Name);
    const query = createQuery(Position, Name);
    // A shared callback and a counter keep the loop itself free of allocation.
    const move = ([position]: [{ x: number }, { name: string }]) => {
      position.x++;
    };
    let count = 0;
    const run = () => {
      world.query(query).updateEach(move);
      for (const entity of world.query(query)) if (entity.isAlive()) count++;
    };

    for (let i = 0; i < 50; i++) run();
    runtime.gc!();
    const before = runtime.process.memoryUsage().heapUsed;
    for (let i = 0; i < 200; i++) run();
    const grown = runtime.process.memoryUsage().heapUsed - before;

    // Copying the entities once per run would cost 200 runs times 8 kB.
    expect(grown).toBeLessThan(200 * 1024);
    expect(count).toBe(250_000);
  });
});
