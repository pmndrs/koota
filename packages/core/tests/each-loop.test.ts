import { describe, expect, it } from 'vitest';
import { createWorld, Not, Or, trait, type Entity, type QueryParameter } from '../src';
import { withoutEachCodegen } from './utils/each-codegen';

function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Runs a seeded workload of readEach and updateEach calls whose callbacks write SoA and
 * AoS records, move, spawn and destroy entities, and whose change observers do the same.
 * Some rounds pass `entity: false` and find the entity from a visit counter instead.
 * Returns every visit and the final state, named by spawn order so two worlds compare.
 */
function workload(seed: number): unknown {
  const random = mulberry32(seed);
  const chance = (p: number) => random() < p;
  const pick = <T>(items: readonly T[]) => items[Math.floor(random() * items.length)];
  const A = trait({ x: 0, y: 0 });
  const B = trait({ v: 0 });
  const C = trait(() => ({ n: 0 }));
  const Tag = trait();
  const world = createWorld();
  const names = new Map<Entity, number>();
  const all: Entity[] = [];
  const log: unknown[] = [];
  const toggle = (entity: Entity, tag: typeof Tag) => {
    if (entity.has(tag)) entity.remove(tag);
    else entity.add(tag);
  };
  const spawn = (...parameters: Parameters<typeof world.spawn>) => {
    const entity = world.spawn(...parameters);
    names.set(entity, all.length);
    all.push(entity);
  };

  const count = chance(0.5) ? 2 + Math.floor(random() * 30) : 256 + Math.floor(random() * 200);
  for (let i = 0; i < count; i++) {
    spawn(
      A({ x: i, y: 0 }),
      ...(chance(0.7) ? [B({ v: i })] : []),
      ...(chance(0.5) ? [C({ n: i })] : []),
      ...(chance(0.3) ? [Tag] : [])
    );
  }
  if (chance(0.5)) {
    world.onChange(A, (entity) => {
      const name = names.get(entity)!;
      log.push(['change A', name]);
      if (name % 17 === seed % 17) entity.destroy();
      else if (name % 13 === 0) toggle(entity, Tag);
    });
  }
  if (chance(0.4)) world.onChange(C, (entity) => log.push(['change C', names.get(entity)]));

  const queries: QueryParameter[][] = [
    [A, B],
    [A, C],
    [A, Or(B, C)],
    [A, B, Not(Tag)],
    [Or(B, C)],
    [C, A],
  ];
  for (let round = 0; round < 4; round++) {
    const result = world.query(...pick(queries));
    // The visit order follows storage and can differ from the result order, so a readEach records it first.
    const order: Entity[] = [];
    result.readEach((_, entity) => order.push(entity));
    const callback = (values: unknown[], entity: Entity, index: number) => {
      log.push([round, index, names.get(entity), JSON.stringify(values)]);
      for (const record of values as Record<string, number>[]) {
        if (record === undefined) continue;
        for (const field in record) if (chance(0.6)) record[field] += 1;
      }
      if (!entity.isAlive()) return;
      if (chance(0.04)) toggle(entity, Tag);
      if (chance(0.03)) {
        const other = pick(all);
        if (other.isAlive()) other.destroy();
      }
      if (chance(0.05) && index + 1 < order.length) {
        // The next entity often starts the next archetype of the walk.
        const next = order[index + 1];
        if (next.isAlive() && chance(0.5)) next.destroy();
        else if (next.isAlive()) next.add(Tag);
      }
      if (chance(0.03)) spawn(A({ x: 1000 + all.length }), B);
      if (chance(0.03) && entity.has(B)) entity.set(B, { v: -1 });
      if (chance(0.02)) {
        if (entity.has(B)) entity.remove(B);
        else entity.add(C);
      }
      if (chance(0.01)) entity.destroy();
    };
    let visit = 0;
    // The counter gives the index and the recorded order the entity.
    const records = (...args: [unknown[]]) => {
      log.push(args.length);
      const index = visit++;
      callback(args[0], order[index], index);
    };
    const changeDetection = pick(['auto', 'always', 'never'] as const);
    const read = chance(0.3);
    if (chance(0.5)) {
      if (read) result.readEach(callback);
      else result.updateEach(callback, { changeDetection });
    } else if (read) result.readEach(records, { entity: false });
    else result.updateEach(records, { entity: false, changeDetection });
  }

  const final = all.map((entity) =>
    entity.isAlive()
      ? [entity.get(A), entity.get(B), entity.has(C) ? { ...entity.get(C) } : null, entity.has(Tag)]
      : null
  );
  world.destroy();
  return [log, final];
}

describe('readEach and updateEach loops', () => {
  it('discards writes to SoA records in readEach', () => {
    const Position = trait({ x: 0, y: 0 });
    const world = createWorld();
    const entities = Array.from({ length: 300 }, (_, i) => world.spawn(Position({ x: i })));

    world.query(Position).readEach(([position]) => {
      position.x = -1;
    });

    entities.forEach((entity, i) => expect(entity.get(Position)!.x).toBe(i));
  });

  it('runs closures that share source text with their own captures', () => {
    const Position = trait({ x: 0, y: 0 });
    const world = createWorld();
    const entities = Array.from({ length: 300 }, () => world.spawn(Position));
    const system = (step: number) => () =>
      world.query(Position).updateEach(([position]) => {
        position.x += step;
      });
    const total = (scale: number) => {
      let sum = 0;
      world.query(Position).readEach(([position]) => {
        sum += position.x * scale;
      });
      return sum;
    };

    system(1)();
    system(10)();

    for (const entity of entities) expect(entity.get(Position)!.x).toBe(11);
    expect(total(1)).toBe(3300);
    expect(total(2)).toBe(6600);
  });

  it('handles more traits than fit a detection mask', () => {
    const traits = Array.from({ length: 35 }, () => trait({ value: 0 }));
    const world = createWorld();
    const entity = world.spawn(...traits);
    const changed: number[] = [];
    world.onChange(traits[33], () => changed.push(33));

    world.query(...traits).updateEach((values) => {
      const records = values as unknown as { value: number }[];
      records[2].value = 1;
      records[33].value = 2;
    });

    expect(entity.get(traits[2])!.value).toBe(1);
    expect(entity.get(traits[33])!.value).toBe(2);
    expect(changed).toEqual([33]);
  });

  it('falls back to a generic loop without code generation', () => {
    const [values, blocked] = withoutEachCodegen(() => {
      const Position = trait({ x: 0, y: 0 });
      const Velocity = trait(() => ({ x: 1 }));
      const world = createWorld();
      const entities = Array.from({ length: 4 }, (_, i) => world.spawn(Position({ x: i }), Velocity));
      world.query(Position, Velocity).updateEach(([position, velocity]) => {
        position.x += velocity.x;
      });
      return entities.map((entity) => entity.get(Position)!.x);
    });

    expect(blocked).toBeGreaterThan(0);
    expect(values).toEqual([1, 2, 3, 4]);
  });

  it('gives the same results with and without code generation on random workloads', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const compiled = workload(seed);
      const [generic, blocked] = withoutEachCodegen(() => workload(seed));
      expect(blocked).toBeGreaterThan(0);
      expect(generic, `seed ${seed}`).toEqual(compiled);
    }
  });
});
