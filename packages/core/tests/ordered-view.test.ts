import { beforeEach, describe, expect, expectTypeOf, it } from 'vitest';
import { createWorld, trait, type Entity, type Trait } from '../src';

describe('Sorted query views', () => {
  const world = createWorld();
  const Position = trait({ x: 0 });
  const ascending = (a: Entity, b: Entity) => a.get(Position)!.x - b.get(Position)!.x;
  beforeEach(() => world.reset());

  it('shares the cached read-only entity array across sorted selections', () => {
    const a = world.spawn(Position({ x: 2 }));
    const b = world.spawn(Position({ x: 1 }));
    const query = world.query(Position);
    const sorted = query.sort(ascending, [Position]);
    const entities = sorted.entities;

    expectTypeOf(entities).toEqualTypeOf<readonly Entity[]>();
    expect(Array.isArray(entities)).toBe(true);
    expect(entities).toEqual([b, a]);
    expect(sorted.entities).toBe(entities);
    expect(sorted.select().entities).toBe(entities);
    expect(query.entities).toEqual([a, b]);
  });

  it('refreshes the borrowed entity array after dependency and membership changes', () => {
    const a = world.spawn(Position({ x: 2 }));
    const b = world.spawn(Position({ x: 1 }));
    const sorted = world.query(Position).sort(ascending, [Position]);
    expect(sorted.entities).toEqual([b, a]);

    a.set(Position, { x: 0 });
    expect(sorted.entities).toEqual([a, b]);
    const c = world.spawn(Position({ x: -1 }));
    expect(sorted.entities).toEqual([c, a, b]);
    b.remove(Position);
    expect(sorted.entities).toEqual([c, a]);
  });

  it('maps in sorted order and leaves the base query in its original order', () => {
    world.spawn(Position({ x: 2 }));
    world.spawn(Position({ x: 1 }));
    const query = world.query(Position);
    const label = (entity: Entity, index: number) => `${index}: ${entity.get(Position)!.x}`;
    expect(query.sort(ascending).map(label)).toEqual(['0: 1', '1: 2']);
    expect(query.map(label)).toEqual(['0: 2', '1: 1']);
  });

  it('updates the order when members or sort keys change', () => {
    const a = world.spawn(Position({ x: 2 }));
    const sorted = world.query(Position).sort(ascending, [Position]);
    expect(sorted.toArray()).toEqual([a]);

    const b = world.spawn(Position({ x: 1 }));
    expect(sorted.toArray()).toEqual([b, a]);
    a.set(Position, { x: 0 });
    expect(sorted.toArray()).toEqual([a, b]);
    a.remove(Position);
    expect(sorted.toArray()).toEqual([b]);
  });

  it('writes selected traits in sorted order', () => {
    const Rank = trait({ value: 0 });
    const a = world.spawn(Position({ x: 2 }), Rank);
    const b = world.spawn(Position({ x: 1 }), Rank);
    let direction = 1;
    const sorted = world
      .query(Position, Rank)
      .sort((a, b) => direction * ascending(a, b), [Position]);
    const ranks = sorted.select(Rank);
    ranks.each((rank, _entity, index) => {
      rank.value = index + 1;
    });
    expect(b.get(Rank)!.value).toBe(1);
    expect(a.get(Rank)!.value).toBe(2);

    direction = -1;
    expect(sorted.first).toBe(b);
    expect(ranks.entities).toEqual([b, a]);
    ranks.invalidate();
    expect(ranks.entities).toEqual([a, b]);
    expect(sorted.first).toBe(a);
  });

  it.each(['each', 'forEach', 'map', 'for...of'] as const)(
    'defers sorting until re-entry after active walks finish (%s)',
    (mode) => {
      const a = world.spawn(Position({ x: 2 }));
      const b = world.spawn(Position({ x: 1 }));
      const c = world.spawn();
      const sorted = world.query(Position).sort(ascending, [Position]);
      const selected = sorted.select();
      const entities = sorted.entities;
      const visited: Entity[] = [];
      const visit = (entity: Entity) => {
        visited.push(entity);
        if (visited.length !== 1) return;
        a.set(Position, { x: 0 });
        c.add(Position({ x: 3 }));
        sorted.invalidate();

        expect(sorted.first).toBe(b);
        expect(sorted.entities).toBe(entities);
        expect(selected.entities).toBe(entities);
        expect(sorted.toArray()).toEqual([b, a]);
        expect([...selected]).toEqual([b, a]);
        expect(sorted.toArray()).toEqual([b, a]);
      };

      switch (mode) {
        case 'each':
          sorted.each((_position, entity) => visit(entity));
          break;
        case 'forEach':
          sorted.forEach(visit);
          break;
        case 'map':
          sorted.map(visit);
          break;
        case 'for...of':
          for (const entity of sorted) visit(entity);
          break;
      }

      expect(visited).toEqual([b, a]);
      expect([...sorted]).toEqual([a, b, c]);
      expect(sorted.entities).toEqual([a, b, c]);
    }
  );

  it.each(['break', 'throw'] as const)('allows sorting after a loop exits with %s', (mode) => {
    const a = world.spawn(Position({ x: 2 }));
    const b = world.spawn(Position({ x: 1 }));
    const sorted = world.query(Position).sort(ascending, [Position]);
    const walk = () => {
      for (const _entity of sorted) {
        a.set(Position, { x: 0 });
        expect(sorted.first).toBe(b);
        if (mode === 'throw') throw new Error('Stop walking');
        break;
      }
    };

    if (mode === 'throw') expect(walk).toThrow('Stop walking');
    else walk();
    expect([...sorted]).toEqual([a, b]);
  });

  it('tracks every dependency and reuses views for equivalent arrays', () => {
    const Rank = trait({ value: 0 });
    const a = world.spawn(Position({ x: 2 }), Rank);
    const b = world.spawn(Position({ x: 1 }), Rank);
    const query = world.query(Position, Rank);
    const compare = (a: Entity, b: Entity) =>
      a.get(Position)!.x + a.get(Rank)!.value - b.get(Position)!.x - b.get(Rank)!.value;
    const deps = [Position, Rank] as const;
    const sorted = query.sort(compare, deps);
    expect(sorted.first).toBe(b);
    expect(query.sort(compare, [Position, Rank])).toBe(sorted);

    a.set(Position, { x: 0 });
    expect(sorted.first).toBe(a);
    a.set(Rank, { value: 3 });
    expect(sorted.first).toBe(b);
  });

  it('keeps its dependencies when the caller edits the array', () => {
    const a = world.spawn(Position({ x: 2 }));
    const b = world.spawn(Position({ x: 1 }));
    const deps: Trait[] = [Position];
    const query = world.query(Position);
    const sorted = query.sort(ascending, deps);
    expect(sorted.first).toBe(b);

    deps.length = 0;
    a.set(Position, { x: 0 });
    expect(sorted.first).toBe(a);
    expect(query.sort(ascending, [Position])).toBe(sorted);
  });

  it.each([{ deps: undefined }, { deps: [] }])(
    're-sorts without dependencies ($deps)',
    ({ deps }) => {
      const a = world.spawn(Position({ x: 1 }));
      const b = world.spawn(Position({ x: 2 }));
      let direction = 1;
      const sorted = world.query(Position).sort((a, b) => direction * ascending(a, b), deps);
      expect(sorted.first).toBe(a);
      expect(sorted.entities).toEqual([a, b]);
      direction = -1;
      expect(sorted.entities).toEqual([b, a]);
      expect(sorted.first).toBe(b);
    }
  );
});
