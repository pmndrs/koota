import { beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest';
import {
  createRemoved,
  createWorld,
  trait,
  type Entity,
  type OrderedView,
  type SortKeySelector,
} from '../src';

describe('Query sortBy', () => {
  const world = createWorld();
  const Position = trait({ x: 0 });
  const byX: SortKeySelector<typeof Position> = (position) => position.x;
  beforeEach(() => world.reset());

  it('reads each key once and shares the cached view and its selections', () => {
    const Rank = trait({ value: 0 });
    const a = world.spawn(Position({ x: 2 }), Rank);
    const b = world.spawn(Position({ x: 1 }), Rank);
    const query = world.query(Position, Rank);
    const selector = vi.fn(byX);
    const sorted = query.sortBy(Position, selector);
    expectTypeOf(sorted).toEqualTypeOf<OrderedView<[typeof Position, typeof Rank]>>();
    expectTypeOf(sorted.entities).toEqualTypeOf<readonly Entity[]>();
    const entities = sorted.entities;
    expect(entities).toEqual([b, a]);
    expect(selector).toHaveBeenCalledTimes(2);
    expect(query.sortBy(Position, selector)).toBe(sorted);
    expect(sorted.entities).toBe(entities);
    expect(sorted.select(Rank).entities).toBe(entities);
    expect(query.entities).toEqual([a, b]);
    a.set(Rank, { value: 1 });
    sorted.select(Rank).each((rank) => rank.value++);
    expect(sorted.entities).toBe(entities);
    expect(selector).toHaveBeenCalledTimes(2);
    sorted.each((position) => expectTypeOf(position).toEqualTypeOf<{ x: number }>());
  });

  it('refreshes after key writes, membership changes, and emptying and refilling the query', () => {
    const query = world.query(Position);
    const sorted = query.sortBy(Position, byX);
    expect(sorted.entities).toEqual([]);
    const a = world.spawn(Position({ x: 2 }));
    const b = world.spawn(Position({ x: 1 }));
    expect(sorted.entities).toEqual([b, a]);
    a.set(Position, { x: 0 });
    expect(sorted.entities).toEqual([a, b]);
    query.each((position) => {
      position.x = -position.x;
    });
    expect(sorted.entities).toEqual([b, a]);
    b.remove(Position);
    expect(sorted.entities).toEqual([a]);
    a.destroy();
    expect(sorted.entities).toEqual([]);
    b.add(Position({ x: 3 }));
    const c = world.spawn(Position({ x: -1 }));
    expect(sorted.entities).toEqual([c, b]);
  });

  it('reuses warmed records across refreshes with different traits', () => {
    const Rank = trait({ value: 3 });
    const entities = Array.from({ length: 4 }, () => world.spawn(Position, Rank));
    // Weak membership observes reuse without retaining borrowed records.
    const records = new WeakSet<object>();
    let warmed = false;
    const observe = (record: object) => {
      if (warmed) expect(records.has(record)).toBe(true);
      else records.add(record);
    };
    const sorted = world.query(Rank).sortBy(Position, (position) => {
      observe(position);
      return position.x;
    });
    let total = 0;
    const visit = (rank: { value: number }) => {
      observe(rank);
      total += rank.value;
    };
    sorted.each(visit);
    warmed = true;

    for (let i = 0; i < 20; i++) {
      for (const entity of entities) entity.set(Position, { x: 1 });
      sorted.each(visit);
    }

    expect(total).toBe(21 * 4 * 3);
  });

  it('sorts fractional keys stably across storage pages in either direction', () => {
    const entities = Array.from({ length: 2050 }, (_, i) =>
      world.spawn(Position({ x: ((i * 7919) % 31) / 10 - 1.5 }))
    );
    const query = world.query(Position);
    const sorted = query.sortBy(Position, byX);
    const expected = entities.slice().sort((a, b) => a.get(Position)!.x - b.get(Position)!.x);
    expect(sorted.entities).toEqual(expected);
    expect(query.sortBy(Position, (position) => -position.x).entities).toEqual(
      entities.slice().sort((a, b) => b.get(Position)!.x - a.get(Position)!.x)
    );
    query.each((position) => {
      position.x = -position.x;
    });
    expected.sort((a, b) => a.get(Position)!.x - b.get(Position)!.x);
    expect(sorted.entities).toEqual(expected);
  });

  it('rejects NaN keys with assertions enabled', () => {
    world.spawn(Position({ x: NaN }));
    const sorted = world.query(Position).sortBy(Position, byX);
    expect(() => sorted.entities).toThrow('[SORT_KEY]');
  });

  it('keeps caches separate for different traits and selectors', () => {
    const Other = trait({ x: 0 });
    const a = world.spawn(Position({ x: 2 }), Other({ x: 0 }));
    const b = world.spawn(Position({ x: 1 }), Other({ x: 3 }));
    const query = world.query(Position, Other);
    const sorted = query.sortBy(Position, byX);
    const other = query.sortBy(Other, byX);
    expect(sorted.entities).toEqual([b, a]);
    expect(other.entities).toEqual([a, b]);
    expect(other).not.toBe(sorted);
    expect(query.sortBy(Position, (position) => -position.x).entities).toEqual([a, b]);
  });

  it('sorts keys from atomic trait values', () => {
    const Atomic = trait(() => ({ rank: 0 }));
    const a = world.spawn(Atomic({ rank: 2 }));
    const b = world.spawn(Atomic({ rank: 1 }));
    expect(world.query(Atomic).sortBy(Atomic, (value) => value.rank).entities).toEqual([b, a]);
  });

  it('reads retained keys when sorting a different selection after destruction', () => {
    const Rank = trait({ value: 0 });
    const Removed = createRemoved();
    const a = world.spawn(Position({ x: 2 }), Rank({ value: 20 }));
    const b = world.spawn(Position({ x: 1 }), Rank({ value: 10 }));
    a.destroy();
    b.destroy();
    const sorted = world.query(Removed(Position)).select(Rank).sortBy(Position, byX);
    const visited: [Entity, number][] = [];
    sorted.each((rank, entity) => visited.push([entity, rank.value]));
    expect(visited).toEqual([
      [b, 10],
      [a, 20],
    ]);
  });

  it('shares manual invalidation with selections and keeps equal keys in their prior order', () => {
    const a = world.spawn(Position({ x: 2 }));
    const b = world.spawn(Position({ x: 1 }));
    let direction = 1;
    const sorted = world.query(Position).sortBy(Position, (position) => direction * position.x);
    expect(sorted.entities).toEqual([b, a]);
    direction = -1;
    expect(sorted.entities).toEqual([b, a]);
    sorted.select().invalidate();
    expect(sorted.entities).toEqual([a, b]);
    a.set(Position, { x: 1 });
    expect(sorted.entities).toEqual([a, b]);
  });

  it('excludes pending removals while the base query is being walked', () => {
    const a = world.spawn(Position({ x: 2 }));
    const b = world.spawn(Position({ x: 1 }));
    const c = world.spawn(Position({ x: 0 }));
    const query = world.query(Position);
    const sorted = query.sortBy(Position, byX);
    expect(sorted.entities).toEqual([c, b, a]);
    query.forEach((entity) => {
      if (entity !== a) return;
      b.remove(Position);
      expect(sorted.entities).toEqual([c, a]);
    });
    expect(sorted.entities).toEqual([c, a]);
  });

  it('preserves an active walk during invalidation and nested reads', () => {
    const Rank = trait({ value: 0 });
    const a = world.spawn(Position({ x: 2 }), Rank({ value: 20 }));
    const b = world.spawn(Position({ x: 1 }), Rank({ value: 10 }));
    const c = world.spawn(Rank({ value: 30 }));
    const sorted = world.query(Position).select(Rank).sortBy(Position, byX);
    const entities = sorted.entities;
    const visited: Entity[] = [];
    sorted.each((rank, entity) => {
      visited.push(entity);
      if (visited.length !== 1) return;
      a.set(Position, { x: 0 });
      c.add(Position({ x: 3 }));
      sorted.invalidate();
      expect(sorted.select().entities).toBe(entities);
      expect([...sorted]).toEqual([b, a]);
      const nested: [Entity, number][] = [];
      sorted.each((inner, entity) => nested.push([entity, inner.value]));
      expect(nested).toEqual([
        [b, 10],
        [a, 20],
      ]);
      expect(rank.value).toBe(10);
    });
    expect(visited).toEqual([b, a]);
    expect(sorted.entities).toEqual([a, b, c]);
  });

  it('preserves the published order if a selector throws and retries on the next access', () => {
    const Rank = trait({ value: 0 });
    const a = world.spawn(Position({ x: 2 }), Rank({ value: 20 }));
    const b = world.spawn(Position({ x: 1 }), Rank({ value: 10 }));
    let fail = false;
    const sorted = world.query(Rank).sortBy(Position, (position) => {
      if (fail && position.x === 0) {
        expect(sorted.entities).toEqual([b, a]);
        throw new Error('key unavailable');
      }
      return position.x;
    });
    const previous = sorted.entities;
    sorted.each((rank) => rank.value++);
    a.set(Position, { x: 0 });
    fail = true;
    expect(() => sorted.entities).toThrow('key unavailable');
    expect(previous).toEqual([b, a]);
    fail = false;
    expect(sorted.entities).toEqual([a, b]);
    const values: number[] = [];
    sorted.each((rank) => values.push(rank.value));
    expect(values).toEqual([21, 11]);
  });
});
