import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  $internal,
  createAdded,
  createChanged,
  createQuery,
  createRemoved,
  createWorld,
  getQueryVersion,
  relation,
  trait,
  type Entity,
} from '../src';
import { createTraitWithId } from '../src/api/trait/trait';
import { defineTrait, tier } from '../src/kernel';
import { hasNativeGc } from './utils/gc';

const worlds: ReturnType<typeof createWorld>[] = [];
function create() {
  const world = createWorld();
  worlds.push(world);
  return world;
}
afterEach(() => {
  for (const world of worlds) world.destroy();
  worlds.length = 0;
  tier.uses = 0;
});

// Fused paths compile on first use here, so every test exercises them.
const usesBeforeCompile = tier.uses;
beforeAll(() => {
  tier.uses = 0;
});
afterAll(() => {
  tier.uses = usesBeforeCompile;
});

describe('fused add and remove', () => {
  it('keeps every entity data and defaults new traits when rows swap', () => {
    const world = create();
    const Position = trait({ x: 0, y: 0 });
    const Velocity = trait({ x: 5, y: 6 });
    const Label = trait({ name: 'none' });
    const entities: Entity[] = [];
    for (let i = 0; i < 6; i++) entities.push(world.spawn(Position({ x: i, y: -i })));
    for (let round = 0; round < 3; round++) {
      for (const entity of entities) entity.add(Velocity, Label);
      entities[1].set(Velocity, { x: 99, y: 98 });
      entities[1].set(Label, { name: 'one' });
      entities[1].remove(Velocity);
      expect(entities[1].has(Velocity)).toBe(false);
      for (let i = 0; i < entities.length; i++) {
        expect(entities[i].get(Position)).toEqual({ x: i, y: -i });
      }
      entities[1].add(Velocity);
      expect(entities[1].get(Velocity)).toEqual({ x: 5, y: 6 });
      for (const entity of entities) entity.remove(Velocity, Label);
      for (let i = 0; i < entities.length; i++) {
        expect(entities[i].has(Velocity)).toBe(false);
        expect(entities[i].get(Position)).toEqual({ x: i, y: -i });
      }
    }
  });

  it('keeps the observed query result, version and subscribers in step', () => {
    const world = create();
    const A = trait({ v: 0 });
    const B = trait();
    const q = createQuery(A, B);
    const first = world.spawn(A);
    const second = world.spawn(A);
    const added = vi.fn();
    const removed = vi.fn();
    expect(world.query(q)).toHaveLength(0);
    const version = getQueryVersion(world, q)!;
    first.add(B);
    expect(getQueryVersion(world, q)).toBeGreaterThan(version);
    expect(Array.from(world.query(q))).toEqual([first]);
    world.onQueryAdd(q, added);
    world.onQueryRemove(q, removed);
    second.add(B);
    first.remove(B);
    expect(added).toHaveBeenCalledWith(second);
    expect(removed).toHaveBeenCalledWith(first);
    expect(Array.from(world.query(q))).toEqual([second]);
    const settled = getQueryVersion(world, q);
    first.add(B);
    first.remove(B);
    first.add(B);
    expect(getQueryVersion(world, q)).toBeGreaterThan(settled!);
    expect(added).toHaveBeenCalledTimes(3);
  });

  it('queues work a query subscriber starts and plays it after the move', () => {
    const world = create();
    const A = trait();
    const B = trait();
    const C = trait();
    const q = createQuery(A, B);
    const entity = world.spawn(A);
    world.query(q);
    const seen: boolean[] = [];
    world.onQueryAdd(q, (e) => {
      e.add(C);
      seen.push(e.has(C));
    });
    entity.add(B);
    expect(seen).toEqual([false]);
    expect(entity.has(C)).toBe(true);
  });

  it('starts and stops firing observers as they come and go', () => {
    const world = create();
    const A = trait();
    const B = trait({ v: 1 });
    const entity = world.spawn(A);
    entity.add(B);
    entity.remove(B);
    const onAdd = vi.fn();
    const onRemove = vi.fn();
    const stopAdd = world.onAdd(B, onAdd);
    const stopRemove = world.onRemove(B, onRemove);
    entity.add(B);
    entity.remove(B);
    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(onRemove).toHaveBeenCalledTimes(1);
    stopAdd();
    stopRemove();
    entity.add(B);
    entity.remove(B);
    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it('keeps tracking queries correct after the fused transitions were built', () => {
    const world = create();
    const Added = createAdded();
    const Removed = createRemoved();
    const A = trait();
    const B = trait();
    const entity = world.spawn(A);
    entity.add(B);
    entity.remove(B);
    world.query(Added(B));
    world.query(Removed(B));
    entity.add(B);
    expect(Array.from(world.query(Added(B)))).toEqual([entity]);
    entity.remove(B);
    expect(Array.from(world.query(Removed(B)))).toEqual([entity]);
  });

  it('still runs hooks, factories and relations on the general path', () => {
    const world = create();
    const added = vi.fn();
    const removing = vi.fn();
    const Hooked = trait({ v: 2 }).onAdd(added).onRemove(removing);
    const Shared = trait(() => ({ n: 1 }));
    const Plain = trait();
    const entity = world.spawn(Plain);
    for (let i = 0; i < 2; i++) {
      entity.add(Hooked);
      entity.add(Shared);
      expect(entity.get(Shared)).toEqual({ n: 1 });
      entity.remove(Hooked);
      entity.remove(Shared);
    }
    expect(added).toHaveBeenCalledTimes(2);
    expect(removing).toHaveBeenCalledTimes(2);
  });

  it('adds and removes after a world reset and for repeated or absent traits', () => {
    const world = create();
    const A = trait();
    const B = trait({ v: 3 });
    let entity = world.spawn(A);
    entity.add(B);
    entity.add(B);
    entity.remove(B);
    entity.remove(B);
    world.reset();
    entity = world.spawn(A);
    entity.add(B);
    expect(entity.get(B)).toEqual({ v: 3 });
    entity.remove(B);
    expect(entity.has(B)).toBe(false);
  });

  it('does nothing for a destroyed entity', () => {
    const world = create();
    const A = trait();
    const B = trait();
    const entity = world.spawn(A);
    entity.add(B);
    entity.destroy();
    entity.add(B);
    entity.remove(B);
    expect(entity.isAlive()).toBe(false);
    expect(world.query(A)).toHaveLength(0);
  });
});

describe('fused spawn and destroy', () => {
  it('gives a recycled slot fresh defaults and keeps its neighbors intact', () => {
    const world = create();
    const Position = trait({ x: 1, y: 2 });
    const Label = trait({ name: 'a' });
    const kept: Entity[] = [];
    for (let round = 0; round < 3; round++) {
      const batch = [
        world.spawn(Position, Label),
        world.spawn(Position, Label),
        world.spawn(Position, Label),
      ];
      for (const [i, entity] of batch.entries()) {
        expect(entity.get(Position)).toEqual({ x: 1, y: 2 });
        expect(entity.get(Label)).toEqual({ name: 'a' });
        entity.set(Position, { x: 10 + i, y: 20 + i });
        entity.set(Label, { name: 'z' + i });
      }
      batch[0].destroy();
      expect(batch[0].isAlive()).toBe(false);
      expect(batch[1].get(Position)).toEqual({ x: 11, y: 21 });
      expect(batch[2].get(Label)).toEqual({ name: 'z2' });
      kept.push(batch[1], batch[2]);
    }
    expect(world.query(Position)).toHaveLength(kept.length);
    for (const entity of kept) entity.destroy();
    expect(world.query(Position)).toHaveLength(0);
    expect(kept.every((entity) => !entity.isAlive())).toBe(true);
  });

  it('keeps observed queries, versions and subscribers in step', () => {
    const world = create();
    const A = trait();
    const B = trait({ v: 0 });
    const q = createQuery(A, B);
    expect(world.query(q)).toHaveLength(0);
    const version = getQueryVersion(world, q)!;
    const added = vi.fn();
    const removed = vi.fn();
    world.onQueryAdd(q, added);
    world.onQueryRemove(q, removed);
    const entity = world.spawn(A, B);
    expect(added).toHaveBeenCalledWith(entity);
    expect(getQueryVersion(world, q)).toBeGreaterThan(version);
    expect(Array.from(world.query(q))).toEqual([entity]);
    entity.destroy();
    expect(removed).toHaveBeenCalledWith(entity);
    expect(world.query(q)).toHaveLength(0);
  });

  it('fires spawn and destroy subscribers and hooks added after fused paths ran', () => {
    const world = create();
    const A = trait();
    const Hooked = trait().onRemove(vi.fn());
    world.spawn(A).destroy();
    const spawned = vi.fn();
    const destroyed = vi.fn();
    const stopSpawn = world.onEntitySpawn(spawned);
    const stopDestroy = world.onEntityDestroy(destroyed);
    const entity = world.spawn(A);
    entity.destroy();
    expect(spawned).toHaveBeenCalledWith(entity);
    expect(destroyed).toHaveBeenCalledWith(entity);
    stopSpawn();
    stopDestroy();
    world.spawn(A).destroy();
    expect(spawned).toHaveBeenCalledTimes(1);
    expect(destroyed).toHaveBeenCalledTimes(1);
    world.spawn(Hooked).destroy();
    expect(world.query(Hooked)).toHaveLength(0);
  });

  it('drops entity-scoped subscriptions and frees the handle', () => {
    const world = create();
    const A = trait();
    const entity = world.spawn(A);
    const cb = vi.fn();
    entity.onRemove(A, cb);
    entity.destroy();
    expect(cb).toHaveBeenCalledTimes(1);
    entity.destroy();
    expect(cb).toHaveBeenCalledTimes(1);
    const next = world.spawn(A);
    expect(next.isAlive()).toBe(true);
    expect(entity.isAlive()).toBe(false);
  });

  it('spawns factories and relation holders through the general path and after resets', () => {
    const world = create();
    const A = trait();
    const Shared = trait(() => ({ n: 1 }));
    const Child = relation();
    const parent = world.spawn(A);
    const child = world.spawn(A, Child(parent));
    expect(world.spawn(Shared).get(Shared)).toEqual({ n: 1 });
    expect(child.targetFor(Child)).toBe(parent);
    parent.destroy();
    expect(child.has(Child('*'))).toBe(false);
    child.destroy();
    world.reset();
    const again = world.spawn(A);
    expect(again.has(A)).toBe(true);
    expect(world.query(A)).toHaveLength(1);
  });
});

describe('fused values, factories and hooks', () => {
  it('applies supplied values field by field whatever the argument order', () => {
    const world = create();
    const Position = trait({ x: 0, y: 0 });
    const Velocity = trait({ x: 5, y: 6 });
    const Tag = trait();
    for (let i = 0; i < 3; i++) {
      const a = world.spawn(Velocity({ y: 1 }), Tag, Position({ x: 2 }));
      expect(a.get(Position)).toEqual({ x: 2, y: 0 });
      expect(a.get(Velocity)).toEqual({ x: 5, y: 1 });
      const b = world.spawn(Position, Velocity({ x: 9 }));
      expect(b.get(Position)).toEqual({ x: 0, y: 0 });
      expect(b.get(Velocity)).toEqual({ x: 9, y: 6 });
      const c = world.spawn(Position({ x: 4, y: 4 }), Velocity);
      expect(c.get(Position)).toEqual({ x: 4, y: 4 });
      expect(c.get(Velocity)).toEqual({ x: 5, y: 6 });
      const d = world.spawn(Position, Position({ x: 1 }));
      expect(d.get(Position)).toEqual({ x: 1, y: 0 });
    }
  });

  it('applies supplied values on add and ignores them for a trait already held', () => {
    const world = create();
    const Position = trait({ x: 0, y: 0 });
    const Velocity = trait({ x: 5, y: 6 });
    const entity = world.spawn(Position);
    for (let i = 0; i < 3; i++) {
      entity.add(Velocity({ x: 1 }));
      expect(entity.get(Velocity)).toEqual({ x: 1, y: 6 });
      entity.add(Velocity({ x: 7, y: 7 }));
      expect(entity.get(Velocity)).toEqual({ x: 1, y: 6 });
      entity.remove(Velocity);
      entity.add(Velocity);
      expect(entity.get(Velocity)).toEqual({ x: 5, y: 6 });
      entity.remove(Velocity);
    }
  });

  it('constructs AoS and factory traits for spawn and add, queuing work they start', () => {
    const world = create();
    const Plain = trait();
    const Item = trait(() => ({ list: [] as number[] }));
    const Counter = trait({ id: () => 7, name: 'n' });
    const Spawns = trait(() => {
      world.spawn(Plain);
      return { done: true };
    });
    for (let i = 0; i < 3; i++) {
      const a = world.spawn(Item, Counter);
      const b = world.spawn(Plain);
      b.add(Item);
      b.add(Counter({ name: 'x' }));
      expect(a.get(Item)).toEqual({ list: [] });
      expect(a.get(Counter)).toEqual({ id: 7, name: 'n' });
      expect(b.get(Counter)).toEqual({ id: 7, name: 'x' });
      expect(b.get(Item)).not.toBe(a.get(Item));
      const own = { list: [1] };
      expect(world.spawn(Item(own)).get(Item)).toEqual(own);
      const before = world.query(Plain).length;
      world.spawn(Spawns);
      expect(world.query(Plain).length).toBe(before + 1);
      b.remove(Item, Counter);
    }
  });

  it('runs onAdd hooks on spawn and add', () => {
    const world = create();
    const hook = vi.fn();
    const Hooked = trait({ v: 1 }).onAdd(hook);
    const Plain = trait();
    world.spawn(Hooked);
    world.spawn(Plain).add(Hooked);
    world.spawn(Hooked({ v: 3 }));
    expect(hook).toHaveBeenCalledTimes(3);
  });

  it('spawns with no traits and keeps handles distinct', () => {
    const world = create();
    world.spawn().destroy();
    const baseline = world.entities.length;
    const entities = [world.spawn(), world.spawn(), world.spawn()];
    expect(new Set(entities).size).toBe(3);
    for (const entity of entities) expect(entity.isAlive()).toBe(true);
    entities[1].destroy();
    expect(world.spawn().isAlive()).toBe(true);
    expect(world.entities.length).toBe(baseline + 3);
  });
});

describe('fused paths with unobserved tracking queries', () => {
  it('reports added, changed and removed through fused add, remove, spawn and destroy', () => {
    const world = create();
    const Added = createAdded();
    const Changed = createChanged();
    const Removed = createRemoved();
    const A = trait();
    const B = trait({ v: 0 });
    const seen = (query: ReturnType<typeof Added | typeof Changed | typeof Removed>) =>
      Array.from(world.query(query));
    const entity = world.spawn(A);
    entity.add(B);
    expect(seen(Added(B))).toEqual([entity]);
    expect(seen(Added(B))).toEqual([]);
    expect(seen(Changed(B))).toEqual([]);
    entity.remove(B);
    expect(seen(Removed(B))).toEqual([entity]);
    expect(seen(Removed(B))).toEqual([]);
    entity.add(B({ v: 5 }));
    expect(seen(Changed(B))).toEqual([entity]);
    expect(seen(Added(B))).toEqual([entity]);
    const spawned = world.spawn(A, B({ v: 1 }));
    const plain = world.spawn(A, B);
    expect(seen(Added(B)).sort()).toEqual([spawned, plain].sort());
    expect(seen(Changed(B)).sort()).toEqual([spawned]);
    plain.remove(B);
    expect(seen(Removed(B))).toEqual([plain]);
  });
});

describe('fused paths beside trait subscriptions', () => {
  it('fires subscriptions of watched traits and keeps other traits correct', () => {
    const world = create();
    const A = trait({ v: 1 });
    const B = trait({ v: 2 });
    const C = trait();
    const added = vi.fn();
    const removed = vi.fn();
    const changed = vi.fn();
    world.onAdd(A, added);
    world.onRemove(A, removed);
    world.onChange(A, changed);
    for (let i = 0; i < 3; i++) {
      const entity = world.spawn(B, C);
      entity.add(A({ v: 9 }));
      expect(entity.get(A)).toEqual({ v: 9 });
      entity.remove(B);
      entity.add(B);
      expect(entity.get(B)).toEqual({ v: 2 });
      entity.remove(A);
      const second = world.spawn(A, B);
      second.destroy();
      entity.destroy();
    }
    expect(added).toHaveBeenCalledTimes(6);
    expect(removed).toHaveBeenCalledTimes(6);
    expect(changed).toHaveBeenCalledTimes(3);
  });

  it('subscriptions made after fused paths ran apply from then on and end on reset', () => {
    const world = create();
    const A = trait();
    const B = trait();
    const entity = world.spawn(A);
    entity.add(B);
    entity.remove(B);
    const added = vi.fn();
    const stop = world.onAdd(B, added);
    entity.add(B);
    entity.remove(B);
    world.spawn(B);
    expect(added).toHaveBeenCalledTimes(2);
    stop();
    world.reset();
    const again = world.spawn(A);
    again.add(B);
    expect(added).toHaveBeenCalledTimes(2);
    const scoped = vi.fn();
    again.onRemove(B, scoped);
    again.remove(B);
    expect(scoped).toHaveBeenCalledTimes(1);
  });
});

describe('fused paths during command buffer playback', () => {
  it('plays spawn, add, remove and destroy in order with values and subscriptions intact', () => {
    const world = create();
    const A = trait({ v: 1 });
    const B = trait({ v: 2 });
    const spawned = vi.fn();
    const buffer = world.createCommandBuffer();
    for (let round = 0; round < 2; round++) {
      const first = buffer.spawn(A({ v: 7 }), B);
      const second = buffer.spawn(A);
      buffer.add(second, B({ v: 5 }));
      buffer.remove(first, B);
      buffer.destroy(second);
      world.flush(buffer);
      expect(first.get(A)).toEqual({ v: 7 });
      expect(first.has(B)).toBe(false);
      expect(second.isAlive()).toBe(false);
    }
    world.onEntitySpawn(spawned);
    const third = buffer.spawn(A);
    world.flush(buffer);
    expect(spawned).toHaveBeenCalledWith(third);
    expect(world.query(A)).toHaveLength(3);
  });
});

describe('fused paths against a plain model', () => {
  it.each([
    [false, 0],
    [true, 0],
    [false, 3],
  ])(
    'stay equal to the model over random mutations (watched %s, compiled after %i uses)',
    (watched, uses) => {
      tier.uses = uses;
      const world = create();
      const traits = [
        trait({ x: 0, y: 1 }),
        trait({ name: 'n', on: true }),
        trait(),
        trait(() => ({ items: [] as number[] })),
        trait({ id: () => 42, w: 3 }),
      ];
      const defaults = (index: number): unknown => {
        if (index === 0) return { x: 0, y: 1 };
        if (index === 1) return { name: 'n', on: true };
        if (index === 2) return undefined;
        if (index === 3) return { items: [] };
        return { id: 42, w: 3 };
      };
      const q01 = createQuery(traits[0], traits[1]);
      const q2 = createQuery(traits[2]);
      const q34 = createQuery(traits[3], traits[4]);
      world.query(q01);
      world.query(q2);
      world.query(q34);
      const watcher = vi.fn();
      if (watched) world.onAdd(traits[1], watcher);

      let seed = 12345;
      const random = (n: number) => {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        return seed % n;
      };
      const model = new Map<Entity, Map<number, unknown>>();
      const members = (indices: number[]) => {
        const out: Entity[] = [];
        for (const [entity, held] of model) if (indices.every((i) => held.has(i))) out.push(entity);
        return out.sort((a, b) => a - b);
      };
      const valueFor = (index: number): unknown => {
        const roll = random(3);
        if (roll === 0 || index === 2) return undefined;
        if (index === 0) return { x: random(100) };
        if (index === 1) return { on: false };
        if (index === 3) return { items: [random(9)] };
        return { w: random(50) };
      };
      const merged = (index: number, value: unknown): unknown => {
        const base = defaults(index);
        if (value === undefined || index === 3) return value === undefined ? base : value;
        return { ...(base as object), ...(value as object) };
      };
      const config = (index: number, value: unknown) =>
        value === undefined ? traits[index] : traits[index](value as never);

      for (let step = 0; step < 4000; step++) {
        const op = random(10);
        const live = [...model.keys()];
        if (op < 3 || live.length === 0) {
          const picks = [0, 1, 2, 3, 4].filter(() => random(2) === 0);
          const values = picks.map((index) => valueFor(index));
          const entity = world.spawn(...picks.map((index, i) => config(index, values[i])));
          model.set(entity, new Map(picks.map((index, i) => [index, merged(index, values[i])])));
        } else if (op < 5) {
          const entity = live[random(live.length)];
          const picks = [0, 1, 2, 3, 4].filter(() => random(3) === 0);
          if (picks.length === 0) picks.push(random(5));
          const values = picks.map((index) => valueFor(index));
          entity.add(...picks.map((index, i) => config(index, values[i])));
          const held = model.get(entity)!;
          for (const [i, index] of picks.entries()) {
            if (!held.has(index)) held.set(index, merged(index, values[i]));
          }
        } else if (op < 7) {
          const entity = live[random(live.length)];
          const picks = [0, 1, 2, 3, 4].filter(() => random(3) === 0);
          if (picks.length === 0) picks.push(random(5));
          entity.remove(...picks.map((index) => traits[index]));
          for (const index of picks) model.get(entity)!.delete(index);
        } else if (op < 8) {
          const entity = live[random(live.length)];
          entity.destroy();
          model.delete(entity);
          expect(entity.isAlive()).toBe(false);
        } else {
          const entity = live[random(live.length)];
          const held = model.get(entity)!;
          if (held.has(0)) {
            const x = random(1000);
            entity.set(traits[0], { x });
            held.set(0, { ...(held.get(0) as object), x });
          }
        }
        if (step % 50 === 0 || step > 3990) {
          for (const [entity, held] of model) {
            for (let index = 0; index < 5; index++) {
              expect(entity.has(traits[index])).toBe(held.has(index));
              if (held.has(index) && index !== 2)
                expect(entity.get(traits[index])).toEqual(held.get(index));
            }
          }
          expect(Array.from(world.query(q01)).sort((a, b) => a - b)).toEqual(members([0, 1]));
          expect(Array.from(world.query(q2)).sort((a, b) => a - b)).toEqual(members([2]));
          expect(Array.from(world.query(q34)).sort((a, b) => a - b)).toEqual(members([3, 4]));
        }
      }
    }
  );
});

describe('fused membership counting', () => {
  it('settles counted flips before a version read and before subscribers attach', () => {
    const world = create();
    const A = trait();
    const B = trait();
    const q = createQuery(A, B);
    const other = createQuery(A);
    const entity = world.spawn(A);
    world.query(q);
    world.query(other);
    const start = getQueryVersion(world, q)!;
    const otherStart = getQueryVersion(world, other)!;
    entity.add(B);
    entity.remove(B);
    entity.add(B);
    world.spawn(A, B).destroy();
    const moved = getQueryVersion(world, q)!;
    expect(moved).toBeGreaterThan(start);
    expect(getQueryVersion(world, other)).toBeGreaterThan(otherStart);
    entity.remove(B);
    const added = vi.fn();
    const removed = vi.fn();
    world.onQueryAdd(q, added);
    world.onQueryRemove(q, removed);
    entity.add(B);
    entity.remove(B);
    expect(added).toHaveBeenCalledTimes(1);
    expect(removed).toHaveBeenCalledTimes(1);
    expect(getQueryVersion(world, q)).toBeGreaterThan(moved);
    expect(world.query(q)).toHaveLength(0);
  });

  it('keeps cached query results fresh across counted moves and spawns', () => {
    const world = create();
    const A = trait({ v: 0 });
    const B = trait();
    const q = createQuery(A, B);
    const entities = [world.spawn(A), world.spawn(A), world.spawn(A)];
    expect(world.query(q)).toHaveLength(0);
    entities[0].add(B);
    expect(Array.from(world.query(q))).toEqual([entities[0]]);
    entities[1].add(B);
    entities[0].remove(B);
    expect(Array.from(world.query(q))).toEqual([entities[1]]);
    const spawned = world.spawn(A, B);
    expect(Array.from(world.query(q)).sort()).toEqual([entities[1], spawned].sort());
    spawned.destroy();
    expect(Array.from(world.query(q))).toEqual([entities[1]]);
  });
});

describe('fused paths beside relation pairs', () => {
  it('moves entities that hold pairs and keeps targets, data and queries', () => {
    const world = create();
    const Flag = trait({ v: 1 });
    const Mark = trait();
    const Link = relation({ store: { weight: 1 } });
    const parent = world.spawn(Mark);
    const children = [1, 2, 3].map((n) => world.spawn(Link(parent, { weight: n }), Mark));
    const linked = createQuery(Link('*'), Flag);
    expect(world.query(linked)).toHaveLength(0);
    for (let round = 0; round < 3; round++) {
      for (const child of children) child.add(Flag({ v: round }));
      expect(world.query(linked)).toHaveLength(3);
      children[1].remove(Flag);
      for (const [i, child] of children.entries()) {
        expect(child.targetFor(Link)).toBe(parent);
        expect(child.get(Link(parent))).toEqual({ weight: i + 1 });
        expect(child.has(Mark)).toBe(true);
      }
      children[1].add(Flag);
      expect(parent.sourcesFor(Link).sort()).toEqual([...children].sort());
      for (const child of children) child.remove(Flag);
      expect(world.query(linked)).toHaveLength(0);
    }
    const sibling = world.spawn(Link(parent), Flag);
    sibling.destroy();
    expect(parent.sourcesFor(Link)).toHaveLength(3);
  });
});

describe('fused add of several traits', () => {
  it('adds in one transition with values, skips held traits and flips queries once', () => {
    const world = create();
    const A = trait({ v: 1 });
    const B = trait({ v: 2 });
    const C = trait();
    const Fac = trait(() => ({ n: [] as number[] }));
    const q = createQuery(A, B);
    const first = world.spawn(C);
    world.query(q);
    const start = getQueryVersion(world, q)!;
    for (let round = 0; round < 3; round++) {
      first.add(B({ v: 20 }), A);
      expect(first.get(A)).toEqual({ v: 1 });
      expect(first.get(B)).toEqual({ v: 20 });
      first.add(A({ v: 9 }), Fac, B({ v: 7 }));
      expect(first.get(A)).toEqual({ v: 1 });
      expect(first.get(Fac)).toEqual({ n: [] });
      expect(first.get(B)).toEqual({ v: 20 });
      first.remove(A, B, Fac, C);
      expect(first.has(C)).toBe(false);
      first.add(C);
    }
    expect(getQueryVersion(world, q)).toBeGreaterThan(start);
    first.add();
    first.add(C, C);
    expect(first.has(C)).toBe(true);
  });

  it('notifies query subscribers once per entity for a multiple add', () => {
    const world = create();
    const A = trait();
    const B = trait();
    const C = trait();
    const q = createQuery(A, B, C);
    const entity = world.spawn();
    world.query(q);
    const added = vi.fn();
    const removed = vi.fn();
    world.onQueryAdd(q, added);
    world.onQueryRemove(q, removed);
    entity.add(A, B, C);
    entity.remove(A, B);
    expect(added).toHaveBeenCalledTimes(1);
    expect(removed).toHaveBeenCalledTimes(1);
  });
});

describe('fused paths and query subscribers that act or throw', () => {
  it('closes the mutation scope when a subscriber throws after a factory ran', () => {
    const world = create();
    const A = trait();
    const B = trait();
    const F = trait({ s: () => 1 });
    world.spawn(A, F, B).destroy();
    world.onQueryAdd(createQuery(F), () => {
      throw new Error('subscriber');
    });
    expect(() => world.spawn(A).add(F)).toThrow('subscriber');
    expect(() => world.reset()).not.toThrow();
  });

  it('lets every subscriber of one transition hear before queued work plays', () => {
    const world = create();
    const A = trait();
    const q1 = createQuery(A);
    const q2 = createQuery(A);
    const heard: Entity[][] = [[], []];
    const seeds = world.spawn(A);
    world.query(q1);
    world.query(q2);
    world.onQueryAdd(q1, (entity) => {
      heard[0].push(entity);
      entity.destroy();
    });
    world.onQueryAdd(q2, (entity) => heard[1].push(entity));
    const entity = world.spawn(A);
    expect(heard[0]).toEqual([entity]);
    expect(heard[1]).toEqual([entity]);
    expect(entity.isAlive()).toBe(false);
    expect(seeds.isAlive()).toBe(true);
  });
});

describe('fused code cache', () => {
  it.skipIf(!hasNativeGc())(
    'keeps the heap flat across worlds of fresh traits with random defaults',
    async () => {
      const gc = Reflect.get(globalThis, 'gc') as () => void;
      let seed = 1;
      const random = (n: number) => {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        return seed % n;
      };
      const heap: number[] = [];
      for (let round = 0; round < 8; round++) {
        const traits = [
          trait(),
          trait(),
          trait({ x: Math.random() }),
          trait({ x: Math.random(), label: `n${Math.random()}` }),
          trait({ list: () => [] }),
        ];
        const world = createWorld();
        const entities: Entity[] = [];
        for (let i = 0; i < 400; i++) {
          entities.push(world.spawn(...traits.filter(() => random(2) === 0)));
        }
        for (let i = 0; i < 4000; i++) {
          const entity = entities[random(entities.length)];
          const picked = traits[random(traits.length)];
          if (entity.has(picked)) entity.remove(picked);
          else entity.add(picked);
        }
        world.destroy();
        await new Promise((resolve) => setTimeout(resolve, 0));
        gc();
        heap.push(process.memoryUsage().heapUsed);
      }
      // Generated code that embedded type ids or defaults grew the heap by about 2 MB a round here.
      expect(heap[7] - heap[2]).toBeLessThan(3 * 1024 * 1024);
    }
  );
});

describe('fused remove of several traits', () => {
  it('runs every remove of one call before work its subscribers queue', () => {
    const world = create();
    const A = trait();
    const B = trait({ v: 0 });
    const C = trait();
    const log: string[] = [];
    const qa = createQuery(A);
    const qb = createQuery(B);
    const qc = createQuery(C);
    world.onQueryRemove(qa, (entity) => {
      log.push('removeA');
      entity.add(C);
    });
    world.onQueryRemove(qb, (entity) => log.push(`removeB hasC=${entity.has(C)}`));
    world.onQueryAdd(qc, (entity) => log.push(`addC hasB=${entity.has(B)}`));
    for (let round = 0; round < 3; round++) {
      const entity = world.spawn(A, B);
      entity.remove(A, B);
      expect(log).toEqual(['removeA', 'removeB hasC=false', 'addC hasB=false']);
      log.length = 0;
      entity.destroy();
    }
  });
});

describe('fused paths and general path parity', () => {
  it('runs several factories of one valued spawn or add in argument order', () => {
    const world = create();
    const order: string[] = [];
    const Second = trait({ v: () => (order.push('second'), 1) });
    const First = trait({ v: () => (order.push('first'), 2) });
    const Tag = trait();
    for (let round = 0; round < 3; round++) {
      world.spawn(First, Second({}), Tag);
      expect(order).toEqual(['first', 'second']);
      order.length = 0;
      world.spawn(Tag).add(First, Second);
      expect(order).toEqual(['first', 'second']);
      order.length = 0;
    }
  });

  it('marks a tag changed when spawned with a value but not when added with one', () => {
    const world = create();
    const Changed = createChanged();
    const Tag = trait();
    const Other = trait();
    world.query(Changed(Tag));
    for (let round = 0; round < 3; round++) {
      world.spawn(Other).add([Tag, { a: 1 }] as never);
      expect(world.query(Changed(Tag))).toHaveLength(0);
      const spawned = world.spawn([Tag, { a: 1 }] as never, Other);
      expect(Array.from(world.query(Changed(Tag)))).toEqual([spawned]);
    }
  });
});

describe('fused paths after trait subscriptions end', () => {
  it('returns a trait to the fused path once its last subscriber leaves', () => {
    const world = create();
    const A = trait({ v: 0 });
    const B = trait();
    const state = (world as unknown as Record<symbol, { kernel: { watched: unknown[] } }>)[$internal];
    const watched = () => state.kernel.watched[A[$internal].id] !== undefined;
    const entity = world.spawn(B);
    const added = vi.fn();
    const stopWorld = world.onAdd(A, added);
    const stopEntity = entity.onChange(A, () => {});
    expect(watched()).toBe(true);
    stopWorld();
    expect(watched()).toBe(true);
    stopEntity();
    expect(watched()).toBe(false);
    entity.add(A);
    expect(added).not.toHaveBeenCalled();
    const stopAgain = world.onAdd(A, added);
    entity.remove(A);
    entity.add(A);
    expect(added).toHaveBeenCalledTimes(1);
    stopAgain();
    entity.onRemove(A, () => {});
    expect(watched()).toBe(true);
    entity.destroy();
    expect(watched()).toBe(false);
  });
});

describe('fused swap-remove and slot reuse', () => {
  it('keeps added and changed tracking for the entity moved into a vacated row', () => {
    const world = create();
    const Added = createAdded();
    const Changed = createChanged();
    const A = trait({ v: 0 });
    const B = trait();
    const seen = (query: ReturnType<typeof Added | typeof Changed>) =>
      Array.from(world.query(query)).sort((a, b) => a - b);
    // Registers B so the move below takes the fused path.
    world.spawn(B);
    const [first, second] = [world.spawn(A), world.spawn(A), world.spawn(A)];
    seen(Added(A));
    seen(Changed(A));
    const fresh = world.spawn(A);
    fresh.set(A, { v: 1 });
    // The transition vacates the first row and moves `fresh`, the last row, into it.
    first.add(B);
    expect(seen(Added(A))).toEqual([fresh]);
    expect(seen(Changed(A))).toEqual([fresh]);
    const late = world.spawn(A);
    late.set(A, { v: 2 });
    // The destroy vacates the row of `second` and moves `late`, the last row, into it.
    second.destroy();
    expect(seen(Added(A))).toEqual([late]);
    expect(seen(Changed(A))).toEqual([late]);
    expect(fresh.get(A)).toEqual({ v: 1 });
    expect(late.get(A)).toEqual({ v: 2 });
  });

  it('does not report a recycled slot as removed for its previous entity', () => {
    const world = create();
    const Removed = createRemoved();
    const A = trait();
    const B = trait();
    world.query(Removed(A));
    for (let round = 0; round < 3; round++) {
      const entity = world.spawn(A, B);
      entity.remove(A);
      entity.destroy();
      const next = world.spawn(B);
      expect(Array.from(world.query(Removed(A)))).toEqual([]);
      next.destroy();
    }
  });

  it('keeps old handles dead and new ones intact across many slot reuses', () => {
    const world = create();
    const A = trait({ v: 0 });
    const old: Entity[] = [];
    let current = world.spawn(A({ v: 0 }));
    for (let round = 1; round < 300; round++) {
      current.destroy();
      old.push(current);
      current = world.spawn(A({ v: round }));
      expect(current.get(A)).toEqual({ v: round });
      expect(world.query(A)).toHaveLength(1);
    }
    for (const entity of old) expect(entity.isAlive()).toBe(false);
    expect(new Set(old).has(current)).toBe(false);
  });
});

describe('fused paths beside the general path', () => {
  it('applies a valued add after a removal was read', () => {
    const world = create();
    const Removed = createRemoved();
    const A = trait({ v: 0 });
    const entity = world.spawn(A);
    world.query(Removed(A));
    entity.remove(A);
    expect(Array.from(world.query(Removed(A)))).toEqual([entity]);
    entity.add(A({ v: 4 }));
    expect(entity.get(A)).toEqual({ v: 4 });
    entity.remove(A);
    entity.add(A({ v: 5 }));
    expect(Array.from(world.query(Removed(A)))).toEqual([]);
    expect(entity.get(A)).toEqual({ v: 5 });
  });

  it('adds and removes sparse traits beside plain ones', () => {
    const world = create();
    const Sparse = createTraitWithId(defineTrait({ v: 0 }, { sparse: true }), { v: 0 });
    const Plain = trait({ v: 0 });
    const entity = world.spawn(Plain);
    for (let round = 0; round < 3; round++) {
      entity.add(Sparse({ v: round }));
      entity.add(Plain);
      expect(entity.get(Sparse)).toEqual({ v: round });
      expect(Array.from(world.query(Sparse, Plain))).toEqual([entity]);
      entity.remove(Sparse, Plain);
      expect(entity.has(Sparse)).toBe(false);
      entity.add(Plain, Sparse);
      expect(entity.has(Sparse)).toBe(true);
      expect(Array.from(world.query(Sparse, Plain))).toEqual([entity]);
      entity.remove(Sparse);
    }
  });

  it('runs onSet hooks for valued adds', () => {
    const world = create();
    const hook = vi.fn();
    const A = trait({ v: 0 }).onSet(hook);
    const B = trait();
    const entity = world.spawn(B);
    for (let round = 0; round < 3; round++) {
      entity.add(A({ v: round }));
      expect(entity.get(A)).toEqual({ v: round });
      entity.remove(A);
    }
    expect(hook).toHaveBeenCalledTimes(3);
  });
});
