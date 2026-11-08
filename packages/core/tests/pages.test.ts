import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest';
import { createRemoved, createWorld, Not, relation, trait } from '../src';

describe('Query pages', () => {
  let world: ReturnType<typeof createWorld>;

  beforeEach(() => {
    world = createWorld();
  });

  afterEach(() => {
    world.destroy();
  });

  it.each(['soa', 'aos'] as const)('reads removed and destroyed %s data through pages', (kind) => {
    const Value = kind === 'soa' ? trait({ value: 0 }) : trait(() => ({ value: 0 }));
    const live = world.spawn(Value({ value: 1 }));
    const dead = world.spawn(Value({ value: 2 }));
    live.remove(Value);
    dead.destroy();
    expect(live.get(Value)).toBeUndefined();
    expect(() => dead.get(Value)).toThrow(/\[ENTITY_ALIVE\]/);
    for (let i = 0; i < 1100; i++) world.spawn(Value);

    const Removed = createRemoved();
    const found = new Map();
    for (const {
      stores: [values],
      indices,
      entities,
    } of world.query(Removed(Value)).getPages()) {
      for (let i = 0; i < indices.length; i++) {
        const offset = indices[i];
        found.set(entities[i], Array.isArray(values) ? values[offset].value : values.value[offset]);
      }
    }
    expect(found).toEqual(
      new Map([
        [live, 1],
        [dead, 2],
      ])
    );
    expect(world.query(Removed(Value)).length).toBe(0);
  });

  it('reads and writes matching entities across sparse pages without emitting changes', () => {
    const Position = trait({ x: 0 });
    const Velocity = trait({ x: 2 });
    const entities = Array.from({ length: 2050 }, (_, i) =>
      i % 3 === 0 ? world.spawn(Position({ x: i }), Velocity) : world.spawn()
    ).filter((entity) => entity.has(Position));
    const changed = vi.fn();
    world.onChange(Position, changed);

    const pages = world.query(Position, Velocity).getPages();
    const visited = [];
    for (const {
      stores: [position, velocity],
      indices,
      entities,
    } of pages) {
      for (let i = 0; i < indices.length; i++) {
        const offset = indices[i];
        position.x[offset] += velocity.x[offset];
        visited.push(entities[i]);
      }
    }

    expect(visited).toEqual(entities);
    expect(entities.map((entity) => entity.get(Position)!.x)).toEqual(
      entities.map((_, i) => i * 3 + 2)
    );
    expect(changed).not.toHaveBeenCalled();
  });

  it('keeps caller and selection order while excluding tags, Not, and relation filters', () => {
    const Position = trait({ x: 1 });
    const Name = trait({ value: 'ball' });
    const Active = trait();
    const Hidden = trait();
    const ChildOf = relation({ store: { weight: 1 } });
    const parent = world.spawn();
    world.spawn(Position, Name, Active, ChildOf(parent));

    const query = world.query(Active, Position, Not(Hidden), ChildOf(parent), Name);
    const { stores, indices } = query.getPages()[0];
    expectTypeOf(stores).toEqualTypeOf<[{ x: number[] }, { value: string[] }]>();
    expect(stores).toHaveLength(2);
    expect([stores[0].x[indices[0]], stores[1].value[indices[0]]]).toEqual([1, 'ball']);
    expect(query.select(Name, Position).getPages()[0].stores).toEqual([stores[1], stores[0]]);
  });

  it('writes AoS values directly through the instance array', () => {
    const Ref = trait(() => ({ value: 1 }));
    const entity = world.spawn(Ref);
    const {
      stores: [refs],
      indices,
    } = world.query(Ref).getPages()[0];
    expectTypeOf(refs).toEqualTypeOf<{ value: number }[]>();

    refs[indices[0]] = { value: 4 };
    expect(entity.get(Ref)).toEqual({ value: 4 });
  });

  it('reuses pages for data changes and refreshes membership when queried again', () => {
    const Position = trait({ x: 1 });
    const first = world.spawn(Position);
    const pages = world.query(Position).getPages();

    first.set(Position, { x: 5 });
    expect(world.query(Position).getPages()).toBe(pages);
    expect(pages[0].stores[0].x[pages[0].indices[0]]).toBe(5);

    const second = world.spawn(Position);
    expect(world.query(Position).getPages()[0].entities).toEqual([first, second]);
    first.remove(Position);
    expect(world.query(Position).getPages()[0].entities).toEqual([second]);
    second.destroy();
    expect(world.query(Position).getPages()).toEqual([]);
  });

  it('keeps cached columns readable and writable as more entities are added', () => {
    const createReference = vi.fn(() => ({ value: 1 }));
    const Value = trait({ scalar: 0.25, vector: [0.5, 1.5, 2.5], ref: createReference });
    const first = world.spawn(Value({ scalar: 42, vector: [4, 5, 6] }));
    const columns = world.query(Value).getPages()[0].stores[0];

    const entities = Array.from({ length: 1100 }, () => world.spawn(Value));
    expect(createReference).toHaveBeenCalledTimes(entities.length + 1);
    expect(first.get(Value)).toEqual({ scalar: 42, vector: [4, 5, 6], ref: { value: 1 } });
    expect(entities.at(-1)!.get(Value)).toEqual({
      scalar: 0.25,
      vector: [0.5, 1.5, 2.5],
      ref: { value: 1 },
    });

    const current = world.query(Value).getPages()[0];
    columns.scalar[current.indices[0]] = 44;
    columns.vector[current.indices[0] * 3] = 7;
    expect(current.entities[0].get(Value)!.scalar).toBe(44);
    expect(current.entities[0].get(Value)!.vector[0]).toBe(7);
  });
});
