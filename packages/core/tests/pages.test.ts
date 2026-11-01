import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest';
import { createWorld, Not, relation, trait } from '../src';

describe('Query pages', () => {
  let world: ReturnType<typeof createWorld>;

  beforeEach(() => {
    world = createWorld();
  });

  afterEach(() => {
    world.destroy();
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

    expect(pages.length).toBeGreaterThan(1);
    expect(visited).toEqual(entities);
    expect(entities.map((entity) => entity.get(Position)!.x)).toEqual(
      entities.map((_, i) => i * 3 + 2)
    );
    expect(changed).not.toHaveBeenCalled();
  });

  it('orders each page by offset and marks full ranges contiguous', () => {
    const Position = trait({ x: 0 });
    for (let i = 0; i < 2100; i++) world.spawn(Position);
    const pages = world.query(Position).getPages();
    const full = pages.find((page) => page.indices.length === 1024)!;
    for (const page of pages) {
      expect(page.contiguous).toBe(true);
      expect(page.end - page.start).toBe(page.indices.length);
    }
    expect([full.start, full.end]).toEqual([0, 1024]);

    // Removing and re-adding moves entities to the back of the membership list.
    const [first, , , , , sixth] = full.entities;
    first.remove(Position);
    first.add(Position);
    sixth.remove(Position);
    const page = world.query(Position).getPages()[full.index];
    expect(Array.from(page.indices)).toEqual(Array.from(page.indices).sort((a, b) => a - b));
    expect(page.entities[0]).toBe(first);
    expect(page.contiguous).toBe(false);
    expect([page.start, page.end]).toEqual([0, 1024]);
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
});
