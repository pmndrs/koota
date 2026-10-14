import { describe, expect, it } from 'vitest';
import {
  createChanged,
  createWorld,
  Not,
  Or,
  trait,
  type Entity,
  type QueryParameter,
  type Trait,
} from '../src';
import { withoutEachCodegen } from './utils/each-codegen';

type Values = (Record<string, number> | undefined)[];

/** Hash of the keys in [0, 1), so two runs of a scenario make the same choices. */
function roll(...keys: number[]): number {
  let h = 0x9e3779b9;
  for (const key of keys) {
    h = Math.imul(h ^ key, 0x85ebca6b);
    h ^= h >>> 13;
  }
  h = Math.imul(h, 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * Runs a seeded scenario of readEach and updateEach rounds whose callbacks write records,
 * toggle traits, spawn into old and new archetypes, and destroy themselves and entities
 * before and after them. The naive run replays the visit order of the each run with
 * entity.get and entity.set, storing only the fields the callback changed. Both return
 * every visit and the final state, named by spawn order so the runs compare.
 */
function scenario(seed: number, loop: 'each' | 'naive', orders: number[][]): unknown {
  const A = trait({ x: 0, y: 0 });
  const B = trait({ v: 0 });
  const C = trait(() => ({ n: 0 }));
  const Tag = trait();
  const fresh = Array.from({ length: 4 }, () => trait());
  const world = createWorld();
  const all: Entity[] = [];
  const names = new Map<Entity, number>();
  const log: unknown[] = [];
  const spawn = (...traits: Parameters<typeof world.spawn>) => {
    const entity = world.spawn(...traits);
    names.set(entity, all.length);
    all.push(entity);
  };
  const toggle = (entity: Entity, item: Trait) => {
    if (entity.has(item)) entity.remove(item);
    else entity.add(item);
  };

  const count =
    roll(seed, 0) < 0.5 ? 1 + Math.floor(roll(seed, 1) * 40) : 256 + Math.floor(roll(seed, 1) * 150);
  for (let i = 0; i < count; i++) {
    spawn(
      A({ x: i, y: -i }),
      ...(roll(seed, 2, i) < 0.7 ? [B({ v: i })] : []),
      ...(roll(seed, 3, i) < 0.5 ? [C({ n: i })] : []),
      ...(roll(seed, 4, i) < 0.3 ? [Tag] : [])
    );
  }
  // The observer moves entities while the loop stores, so it needs a mode that publishes.
  const observed = seed % 3 === 0;
  if (observed) world.onChange(B, (entity) => entity.get(B)!.v % 7 === 0 && toggle(entity, Tag));

  const queries: [QueryParameter[], Trait[]][] = [
    [
      [A, B],
      [A, B],
    ],
    [
      [A, Or(B, C)],
      [A, B, C],
    ],
    [[A, Not(Tag)], [A]],
    [
      [Or(B, C), A],
      [B, C, A],
    ],
    [
      [C, A],
      [C, A],
    ],
    [
      [A, B, C],
      [A, B, C],
    ],
  ];
  for (let round = 0; round < 5; round++) {
    const r = (...keys: number[]) => roll(seed, 100 + round, ...keys);
    const [parameters, selected] = queries[Math.floor(r(0) * queries.length)];
    const result = world.query(...parameters);
    const read = r(1) < 0.3;
    const modes = observed ? (['auto', 'always'] as const) : (['auto', 'always', 'never'] as const);
    const changeDetection = modes[Math.floor(r(2) * modes.length)];
    // The visit order follows storage and can differ from the result order, so a readEach records it first.
    const order: Entity[] = [];
    if (loop === 'each') result.readEach((_, entity) => order.push(entity));
    const at = (index: number) => (loop === 'each' ? order[index] : all[orders[round][index]]);
    const visited: number[] = [];

    const callback = (values: Values, entity: Entity, index: number) => {
      visited.push(names.get(entity)!);
      log.push([round, names.get(entity), JSON.stringify(values)]);
      if (!read) {
        values.forEach((record, s) => {
          if (record === undefined) return;
          // Some callbacks replace the record with a new object instead of mutating it.
          const target = r(7, index, s) < 0.15 ? (values[s] = { ...record }) : record;
          for (const field in target) {
            if (r(3, index, field.charCodeAt(0)) < 0.6) target[field] += 1 + index;
          }
        });
      }
      if (!entity.isAlive()) return;
      const pick = r(4, index);
      const other = r(5, index);
      if (pick < 0.04) toggle(entity, Tag);
      else if (pick < 0.07) at(index + 1 + Math.floor(other * 5))?.destroy();
      else if (pick < 0.1) at(Math.floor(other * index))?.destroy();
      else if (pick < 0.13) spawn(A({ x: -1 }), B({ v: -1 }));
      else if (pick < 0.16) spawn(A({ x: -2 }), B, fresh[Math.floor(other * fresh.length)]);
      else if (pick < 0.18) toggle(entity, B);
      else if (pick < 0.2) toggle(entity, C);
      else if (pick < 0.21) entity.destroy();
      else if (pick < 0.23 && entity.has(B)) entity.set(B, { v: -5 });
    };

    if (loop === 'each') {
      let visit = 0;
      const records = (values: Values) => callback(values, order[visit], visit++);
      const options = { changeDetection, entity: false } as const;
      if (r(6) < 0.5) {
        if (read) result.readEach(callback as never);
        else result.updateEach(callback as never, { changeDetection });
      } else if (read) result.readEach(records as never, options);
      else result.updateEach(records as never, options);
      // Every entity of the snapshot is visited once, in the recorded order.
      expect(visited, `seed ${seed} round ${round}`).toEqual(order.map((e) => names.get(e)));
      expect(new Set(order)).toEqual(new Set(result));
      orders[round] = visited;
      continue;
    }

    for (let index = 0; index < orders[round].length; index++) {
      const entity = at(index);
      const alive = entity.isAlive();
      const values = selected.map((item) =>
        alive && entity.has(item) ? (entity.get(item) as Record<string, number>) : undefined
      );
      const reads = values.map((value) => (value === undefined ? undefined : { ...value }));
      const records = values.slice();
      callback(values, entity, index);
      if (read || !entity.isAlive()) continue;
      selected.forEach((item, s) => {
        if (values[s] === undefined || !entity.has(item)) return;
        // AoS records are the stored objects, so only a replaced record needs a set.
        if (item === C) {
          if (values[s] !== records[s]) entity.set(C, values[s] as never);
          return;
        }
        const patch: Record<string, number> = {};
        for (const field in reads[s]) {
          if (values[s]![field] !== reads[s]![field]) patch[field] = values[s]![field];
        }
        if (Object.keys(patch).length > 0) {
          entity.set(item, { ...(entity.get(item) as object), ...patch } as never);
        }
      });
    }
  }

  const final = all.map((entity) =>
    entity.isAlive()
      ? [
          entity.get(A),
          entity.get(B) ?? null,
          entity.has(C) ? { ...entity.get(C) } : null,
          entity.has(Tag),
          fresh.map((item) => entity.has(item)),
        ]
      : null
  );
  world.destroy();
  return [log, final];
}

describe('each loops under mutation', () => {
  it('match a naive get and set model with and without code generation', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const orders: number[][] = [];
      const each = scenario(seed, 'each', orders);
      expect(scenario(seed, 'naive', orders), `seed ${seed}`).toEqual(each);
      const [generic] = withoutEachCodegen(() => scenario(seed, 'each', []));
      expect(generic, `generic seed ${seed}`).toEqual(each);
    }
  });

  it('visit every snapshot entity when the callback creates a matching archetype mid walk', () => {
    const run = () => {
      const A = trait({ v: 0 });
      const B = trait();
      const C = trait();
      const D = trait();
      const world = createWorld();
      const first = world.spawn(A({ v: 1 }), B);
      const second = world.spawn(A({ v: 2 }), C);
      const visits: [Entity, number | undefined][] = [];
      let spawned: Entity | undefined;
      // The spawn creates a new archetype in the Or branch of B while the walk is still on it.
      world.query(A, Or(B, C)).updateEach(([a], entity) => {
        visits.push([entity, a?.v]);
        a.v += 10;
        if (entity === first) spawned = world.spawn(A({ v: 3 }), B, D);
      });
      expect(visits).toEqual([
        [first, 1],
        [second, 2],
      ]);
      return [first, second, spawned!].map((entity) => entity.get(A)!.v);
    };

    expect(run()).toEqual([11, 12, 3]);
    expect(withoutEachCodegen(run)[0]).toEqual([11, 12, 3]);
  });

  it('keep stored writes and stay usable when a callback or observer throws midway', () => {
    for (const size of [5, 300]) {
      const Position = trait({ x: 0 });
      const world = createWorld();
      const entities = Array.from({ length: size }, (_, i) => world.spawn(Position({ x: i })));
      const result = world.query(Position);
      const stop = size - 2;

      expect(() =>
        result.updateEach(([position], _entity, index) => {
          if (index === stop) throw new Error('stop');
          position.x += 1000;
        })
      ).toThrow('stop');
      expect(entities.map((e) => e.get(Position)!.x)).toEqual(
        entities.map((_, i) => (i < stop ? i + 1000 : i))
      );

      // An observer that throws once interrupts the loop after the entity it watched is stored.
      let armed = true;
      world.onChange(Position, (entity) => {
        if (armed && entity === entities[1]) {
          armed = false;
          throw new Error('observer');
        }
      });
      expect(() =>
        result.updateEach(([position]) => {
          position.x += 1;
        })
      ).toThrow('observer');
      expect(entities.slice(0, 3).map((e) => e.get(Position)!.x)).toEqual([1001, 1002, 1002]);

      let visits = 0;
      result.updateEach(([position]) => {
        visits++;
        position.x += 1;
      });
      expect(visits).toBe(size);
      expect(entities[2].get(Position)!.x).toBe(1003);
      world.spawn(Position);
      world.reset();
      expect(world.query(Position).length).toBe(0);
    }
  });

  it('nest loops on the same result and on a query that moves the outer rows', () => {
    const Position = trait({ x: 0, y: 0 });
    const Tag = trait();
    const world = createWorld();
    const entities = Array.from({ length: 300 }, (_, i) =>
      world.spawn(Position({ x: i, y: i }), ...(i % 3 === 0 ? [Tag] : []))
    );
    const result = world.query(Position);
    const visits = new Map<Entity, number>();

    result.updateEach(([position], entity, index) => {
      visits.set(entity, (visits.get(entity) ?? 0) + 1);
      position.x += 1;
      if (index === 0) {
        // Writes of the inner loop to fields the outer loop does not change survive.
        result.updateEach(([inner]) => {
          inner.y += 1;
        });
      }
      if (index === 100) {
        // Every row moves between the matched archetypes of the outer query.
        world.query(Position).readEach((_, other) => {
          if (other.has(Tag)) other.remove(Tag);
          else other.add(Tag);
        });
      }
    });

    expect(visits.size).toBe(300);
    expect([...visits.values()].every((n) => n === 1)).toBe(true);
    entities.forEach((entity, i) => {
      expect(entity.get(Position)).toEqual({ x: i + 1, y: i + 1 });
      expect(entity.has(Tag)).toBe(i % 3 !== 0);
    });
  });

  it('run loops from a change observer while the outer loop stores', () => {
    const Position = trait({ x: 0 });
    const Health = trait({ hp: 0 });
    const world = createWorld();
    const entities = Array.from({ length: 300 }, (_, i) => world.spawn(Position({ x: i }), Health));
    const result = world.query(Position);
    const sums: number[] = [];
    world.onChange(Position, (entity) => {
      const index = entities.indexOf(entity);
      if (index % 50 !== 0) return;
      let sum = 0;
      result.readEach(([position]) => (sum += position?.x ?? 0));
      sums.push(sum);
      world.query(Health).updateEach(([health]) => {
        health.hp += 1;
      });
      // Destroying the next entity shifts the rows still ahead of the outer walk.
      entities[index + 1].destroy();
    });

    let visits = 0;
    result.updateEach(([position]) => {
      visits++;
      if (position !== undefined) position.x += 1;
    });

    expect(visits).toBe(300);
    // The first observer runs after its own entity is stored and before the rest are visited.
    expect(sums[0]).toBe((299 * 300) / 2 + 1);
    expect(sums.length).toBe(6);
    entities.forEach((entity, i) => {
      if (i % 50 === 1) expect(entity.isAlive()).toBe(false);
      else expect(entity.get(Position)!.x).toBe(i + 1);
    });
    expect(entities[2].get(Health)!.hp).toBe(6);
  });

  it('give undefined records to the rest of the loop after world reset or destroy', () => {
    for (const end of ['reset', 'destroy'] as const) {
      const Position = trait({ x: 0 });
      const world = createWorld();
      for (let i = 0; i < 300; i++) world.spawn(Position({ x: i }));
      const result = world.query(Position);
      const seen: (number | undefined)[] = [];

      result.updateEach(([position], _entity, index) => {
        seen.push(position?.x);
        if (index === 1) world[end]();
        if (position !== undefined) position.x = -1;
      });

      expect(seen).toEqual([0, 1, ...Array(298).fill(undefined)]);
      const after: unknown[] = [];
      result.readEach(([position]) => after.push(position));
      expect(after).toEqual(Array(300).fill(undefined));
      expect(result.getPages()).toEqual([]);
      if (end === 'reset') {
        const entity = world.spawn(Position({ x: 7 }));
        expect([...world.query(Position)]).toEqual([entity]);
      }
    }
  });

  it('visit a result held past world destroy with undefined records', () => {
    for (const size of [5, 300]) {
      const Position = trait({ x: 0 });
      const world = createWorld();
      for (let i = 0; i < size; i++) world.spawn(Position({ x: i }));
      world.onChange(Position, () => {});
      const result = world.query(Position);
      world.destroy();

      const read: unknown[] = [];
      const updated: unknown[] = [];
      result.readEach(([position]) => read.push(position));
      expect(result.updateEach(([position]) => updated.push(position))).toBe(result);
      expect(updated).toEqual(read);
      expect(updated).toEqual(Array(size).fill(undefined));
      expect(() => result.updateEach(() => {}, { changeDetection: 'always' })).not.toThrow();
      expect(result.getPages()).toEqual([]);
    }
  });

  it('keep worlds apart when their loops interleave', () => {
    const Position = trait({ x: 0 });
    const first = createWorld();
    const second = createWorld();
    const ones = Array.from({ length: 300 }, (_, i) => first.spawn(Position({ x: i })));
    const twos = Array.from({ length: 300 }, (_, i) => second.spawn(Position({ x: -i })));
    // One callback text runs in both worlds, nested.
    const system = (world: typeof first, step: number) =>
      world.query(Position).updateEach(([position], _entity, index) => {
        if (position !== undefined) position.x += step;
        if (index === 10) {
          if (world === first) system(second, 100);
          world.spawn(Position({ x: 5000 }));
          (world === first ? twos : ones)[index + 1].destroy();
        }
      });

    system(first, 1);

    ones.forEach((entity, i) => {
      if (i === 11) expect(entity.isAlive()).toBe(false);
      else expect(entity.get(Position)!.x).toBe(i + 1);
    });
    twos.forEach((entity, i) => {
      if (i === 11) expect(entity.isAlive()).toBe(false);
      else expect(entity.get(Position)!.x).toBe(-i + 100);
    });
    expect(first.query(Position).length).toBe(300);
    expect(second.query(Position).length).toBe(300);
  });

  it('serve a held result after its entities die and their slots are reused', () => {
    const Position = trait({ x: 0 });
    const Velocity = trait({ x: 0 });
    const world = createWorld();
    const old = Array.from({ length: 300 }, (_, i) => world.spawn(Position({ x: i }), Velocity));
    const held = world.query(Position, Velocity);
    for (let i = 0; i < 300; i += 2) old[i].destroy();
    const recycled = Array.from({ length: 300 }, () => world.spawn(Position({ x: -1 }), Velocity));
    for (let i = 1; i < 300; i += 4) old[i].remove(Velocity);

    const seen: (number | undefined)[] = [];
    held.updateEach(([position], entity) => {
      seen.push(position?.x);
      if (position !== undefined) position.x += 1000;
      expect(recycled).not.toContain(entity);
    });

    expect([...held]).toEqual(old);
    // A dead entity has no records. One that left the query still has its Position.
    expect(seen).toEqual(old.map((_, i) => (i % 2 === 0 ? undefined : i)));
    for (const entity of recycled) expect(entity.get(Position)!.x).toBe(-1);
    old.forEach((entity, i) => {
      if (i % 2 === 1) expect(entity.get(Position)!.x).toBe(i + 1000);
    });
    const paged = held.getPages().flatMap((page) => page.entities);
    expect(new Set(paged)).toEqual(new Set(old.filter((_, i) => i % 4 === 3)));
    expect(world.query(Position, Velocity).length).toBe(375);
  });

  it('handle empty results, a single entity and archetypes emptied then refilled', () => {
    const Position = trait({ x: 0 });
    const Missing = trait({ x: 0 });
    const world = createWorld();
    let calls = 0;
    const count = () => calls++;
    const empty = world.query(Position, Missing);
    expect(empty.updateEach(count)).toBe(empty);
    expect(empty.readEach(count, { entity: false })).toBe(empty);
    expect(empty.getPages()).toEqual([]);
    expect(calls).toBe(0);

    const single = world.spawn(Position({ x: 4 }));
    world.query(Position).updateEach(([position], entity, index) => {
      expect([position.x, entity, index]).toEqual([4, single, 0]);
      position.x = 5;
    });
    expect(single.get(Position)!.x).toBe(5);

    const held = world.query(Position);
    single.destroy();
    expect(world.query(Position).length).toBe(0);
    const refilled = Array.from({ length: 300 }, (_, i) => world.spawn(Position({ x: i })));
    const seen: number[] = [];
    world.query(Position).updateEach(([position]) => {
      seen.push(position.x);
      position.x *= 2;
    });
    expect(seen).toEqual(refilled.map((_, i) => i));
    refilled.forEach((entity, i) => expect(entity.get(Position)!.x).toBe(i * 2));
    held.readEach(([position]) => expect(position).toBeUndefined());
  });

  it('give the same results around the 256 entity threshold and past the copy caps', () => {
    const Position = trait({ x: 0, y: 0 });
    const Ref = trait(() => ({ x: 0 }));
    const world = createWorld();
    // One callback shared by results of different sizes and trait layouts.
    const bump = (values: { x: number }[]) => {
      for (const record of values) record.x += 1;
    };
    const groups = [255, 256, 257].map((size) => {
      const Group = trait();
      const entities = Array.from({ length: size }, () => world.spawn(Position, Ref, Group));
      return { Group, entities };
    });
    for (const { Group } of groups) {
      world.query(Position, Group).updateEach(bump as never);
      world.query(Ref, Group).updateEach(bump as never);
      world.query(Group, Ref, Position).updateEach(bump as never);
    }
    for (const entity of groups.flatMap((group) => group.entities)) {
      expect(entity.get(Position)).toEqual({ x: 2, y: 0 });
      expect(entity.get(Ref)).toEqual({ x: 2 });
    }

    // Distinct callback texts past the copy cap, then one text too long to copy.
    for (let i = 0; i < 300; i++) {
      world.query(Position).updateEach(new Function('values', `values[0].x += 1 // ${i}`) as never);
    }
    const long = new Function('values', `values[0].y += 1 // ${'.'.repeat(1100)}`);
    world.query(Position).updateEach(long as never);
    for (const entity of groups.flatMap((group) => group.entities)) {
      expect(entity.get(Position)).toEqual({ x: 302, y: 1 });
    }
  });

  it('publish changes by detection mode and only for fields that changed', () => {
    for (const changeDetection of ['auto', 'always', 'never'] as const) {
      const Position = trait({ x: 0 });
      const Ref = trait(() => ({ x: 0 }));
      const Changed = createChanged();
      const world = createWorld();
      const entities = Array.from({ length: 300 }, () => world.spawn(Position, Ref));
      world.query(Changed(Position));
      const refChanges: Entity[] = [];
      world.onChange(Ref, (entity) => refChanges.push(entity));

      world.query(Position, Ref).updateEach(
        ([position, ref], _entity, index) => {
          if (index % 3 === 0) position.x = 1;
          // Writing the value already stored is not a change.
          if (index % 3 === 1) position.x = 0;
          if (index % 5 === 0) ref.x += 1;
        },
        { changeDetection }
      );

      const publish = changeDetection !== 'never';
      const changed = new Set(world.query(Changed(Position)));
      expect(changed).toEqual(new Set(publish ? entities.filter((_, i) => i % 3 === 0) : []));
      expect(refChanges).toEqual(publish ? entities.filter((_, i) => i % 5 === 0) : []);
      entities.forEach((entity, i) => {
        expect(entity.get(Position)!.x).toBe(i % 3 === 0 ? 1 : 0);
        expect(entity.get(Ref)!.x).toBe(i % 5 === 0 ? 1 : 0);
      });
    }
  });

  it('detect changes on traits past the mask width as observers come and go', () => {
    const traits = Array.from({ length: 31 }, () => trait({ value: 0 }));
    const world = createWorld();
    const entities = Array.from({ length: 300 }, () => world.spawn(...traits));
    const changed: number[] = [];
    const write = (values: { value: number }[]) => {
      for (const record of values) record.value += 1;
    };

    const offLast = world.onChange(traits[30], () => changed.push(30));
    world.query(...traits).updateEach(write as never);
    offLast();
    const offSecond = world.onChange(traits[1], () => changed.push(1));
    world.query(...traits).updateEach(write as never);
    offSecond();
    world.query(...traits).updateEach(write as never);

    expect(changed).toEqual([...Array(300).fill(30), ...Array(300).fill(1)]);
    for (const entity of entities) for (const item of traits) expect(entity.get(item)!.value).toBe(3);
  });

  it('store and detect records replaced in the values array', () => {
    const run = (entity: boolean) => {
      const Ref = trait(() => ({ x: 0 }));
      const Other = trait({ v: 0, w: 0 });
      const Third = trait({ v: 0 });
      const world = createWorld();
      // The first archetype holds every selected trait and the second lacks one.
      const full = world.spawn(Ref, Other({ w: 1 }), Third);
      const partial = world.spawn(Ref, Other({ w: 1 }));
      const changes: string[] = [];
      world.onChange(Ref, () => changes.push('Ref'));
      world.onChange(Other, () => changes.push('Other'));
      world.query(Ref, Or(Other, Third)).updateEach(
        (values: { [key: string]: number }[]) => {
          values[0] = { x: 9 };
          values[1] = { v: 7, w: 1 };
        },
        { entity }
      );
      return [full.get(Ref), partial.get(Ref), full.get(Other), partial.get(Other), changes];
    };

    const expected = [
      { x: 9 },
      { x: 9 },
      { v: 7, w: 1 },
      { v: 7, w: 1 },
      ['Ref', 'Other', 'Ref', 'Other'],
    ];
    for (const entity of [true, false]) {
      expect(run(entity)).toEqual(expected);
      expect(withoutEachCodegen(() => run(entity))[0]).toEqual(expected);
    }
  });

  it('run loops on sorted and selected results in their own order', () => {
    const Position = trait({ x: 0 });
    const Velocity = trait({ v: 0 });
    const world = createWorld();
    const entities = Array.from({ length: 300 }, (_, i) =>
      world.spawn(Position({ x: i }), Velocity({ v: i }))
    );
    const result = world.query(Position, Velocity);
    const reversed = result.sort((a, b) => entities.indexOf(b) - entities.indexOf(a));
    const order: Entity[] = [];

    reversed.updateEach(([position, velocity], entity, index) => {
      order.push(entity);
      position.x += velocity?.v ?? 0;
      // Moving an entity still ahead must not change which entity a later index visits.
      if (index === 0) entities[0].remove(Velocity);
    });

    expect(order).toEqual([...entities].reverse());
    entities.forEach((entity, i) => expect(entity.get(Position)!.x).toBe(i === 0 ? 0 : i * 2));
    const selected: number[] = [];
    result.select(Velocity).readEach(([velocity]) => selected.push(velocity?.v ?? -1));
    expect(selected).toEqual(entities.map((_, i) => (i === 0 ? -1 : i)));
  });
});
