import { describe, expect, it } from 'vitest';
import {
  Not,
  createAdded,
  createDestroyed,
  createListener,
  createRemoved,
  createWorld,
  trait,
} from '../src';

const Position = trait({ x: 0, y: 0 });
const IsHot = trait();
const IsCold = trait();
const Event = trait({ by: 0 });

// A Removed term naming Position at module scope is what keeps its holders readable after destroy.
createRemoved()(Position);

describe('Entity retention', () => {
  it('keeps a destroyed entity readable until its readers have consumed it', () => {
    const world = createWorld();
    const Removed = createRemoved();
    world.query(Removed(Position));

    const entity = world.spawn(Position({ x: 1 }), IsHot);
    entity.destroy();

    expect(entity.isAlive()).toBe(false);
    expect(world.has(entity)).toBe(false);
    expect(world.entities).not.toContain(entity);
    expect(world.query(Position).length).toBe(0);
    expect(entity.has(Position)).toBe(false);
    expect(entity.get(Position)).toEqual({ x: 1, y: 0 });
    expect(() => entity.set(Position, { x: 2 })).toThrow();
    expect(() => entity.add(IsCold)).toThrow();
    expect(() => entity.remove(IsHot)).toThrow();
    expect(() => entity.destroy()).toThrow();

    // The first run exposes it, so it stays readable while the batch is being read.
    expect(world.query(Removed(Position)).toArray()).toEqual([entity]);
    expect(entity.get(Position)).toEqual({ x: 1, y: 0 });

    // The second run swaps the batch out, and the last reader releases it.
    expect(world.query(Removed(Position)).length).toBe(0);
    expect(() => entity.get(Position)).toThrow();
    expect(world.spawn().id()).toBe(entity.id());
  });

  it('releases a destroyed entity at once on a world that retains nothing', () => {
    const world = createWorld({ retain: 0 });
    const entity = world.spawn(Position({ x: 1 }));
    entity.destroy();

    expect(() => entity.get(Position)).toThrow();
    expect(world.spawn().id()).toBe(entity.id());
    expect(() => world.emit(Event({ by: 1 }))).toThrow();
  });

  it('holds destroyed entities up to the cap when nothing reads them', () => {
    const world = createWorld({ retain: 2 });
    const a = world.spawn(Position({ x: 1 }));
    const b = world.spawn(Position({ x: 2 }));
    const c = world.spawn(Position({ x: 3 }));
    a.destroy();
    b.destroy();
    expect(a.get(Position)!.x).toBe(1);
    c.destroy();

    expect(() => a.get(Position)).toThrow();
    expect(b.get(Position)!.x).toBe(2);
    expect(c.get(Position)!.x).toBe(3);
    expect(world.spawn().id()).toBe(a.id());
  });

  it('hands the oldest retained id to a spawn once the ring is full', () => {
    const world = createWorld({ retain: 2 });
    const a = world.spawn(Position({ x: 1 }));
    const b = world.spawn(Position({ x: 2 }));
    a.destroy();
    b.destroy();

    const c = world.spawn(Position({ x: 3 }));
    expect(c.id()).toBe(a.id());
    expect(c).not.toBe(a);
    expect(() => a.get(Position)).toThrow();
    expect(b.get(Position)!.x).toBe(2);
    expect(c.get(Position)!.x).toBe(3);

    const Removed = createRemoved();
    expect(world.query(Removed(Position)).toArray()).toEqual([b]);
  });

  it('seeds a Removed query created after a destroy in destroy order', () => {
    const world = createWorld();
    const kept = world.spawn(Position({ x: 1 }));
    const first = world.spawn(Position({ x: 2 }));
    const second = world.spawn(Position({ x: 3 }));
    second.destroy();
    first.destroy();

    const Removed = createRemoved();
    const removed = world.query(Removed(Position));
    expect(removed.toArray()).toEqual([second, first]);
    removed.forEach((entity) => expect(entity.get(Position)!.x).toBeGreaterThan(1));
    expect(world.query(Removed(Position)).length).toBe(0);
    expect(kept.isAlive()).toBe(true);

    const Later = createRemoved();
    expect(world.query(Later(Position)).length).toBe(0);
    expect(() => first.get(Position)).toThrow();
  });

  it('releases an entity at destroy when no term names a trait it held', () => {
    const Particle = trait({ life: 0 });
    const world = createWorld();
    const Removed = createRemoved();
    world.query(Removed(Position));

    const particle = world.spawn(Particle({ life: 1 }));
    particle.destroy();

    expect(() => particle.get(Particle)).toThrow();
    expect(world.spawn().id()).toBe(particle.id());
    expect(world.query(Removed(Position)).length).toBe(0);
  });

  it('keeps a retained entity in place when an untracked one is destroyed after it', () => {
    const Particle = trait({ life: 0 });
    const world = createWorld();
    const Removed = createRemoved();
    world.query(Removed(Position));

    const kept = world.spawn(Position({ x: 1 }));
    const particle = world.spawn(Particle);
    kept.destroy();
    particle.destroy();

    expect(kept.get(Position)!.x).toBe(1);
    expect(world.spawn().id()).toBe(particle.id());
    expect(kept.get(Position)!.x).toBe(1);
    expect(world.query(Removed(Position)).toArray()).toEqual([kept]);
  });

  it('does not seed an Added query from a retained entity', () => {
    const world = createWorld();
    world.spawn(Position).destroy();

    const Added = createAdded();
    expect(world.query(Added(Position)).length).toBe(0);
  });

  it('tracks entities destroyed while holding the trait with Destroyed', () => {
    const world = createWorld();
    const Destroyed = createDestroyed();
    expect(world.query(Destroyed(Position)).length).toBe(0);

    const held = world.spawn(Position({ x: 3 }));
    const dropped = world.spawn(Position);
    dropped.remove(Position);
    held.destroy();
    dropped.destroy();

    const destroyed = world.query(Destroyed(Position));
    expect(destroyed.toArray()).toEqual([held]);
    destroyed.readEach(([position]) => expect(position.x).toBe(3));
    expect(world.query(Destroyed(Position)).length).toBe(0);
  });

  it('seeds a Destroyed query created after the destroy', () => {
    const world = createWorld();
    const held = world.spawn(Position({ x: 3 }));
    world.spawn(Position);
    held.destroy();

    const Destroyed = createDestroyed();
    expect(world.query(Destroyed(Position)).toArray()).toEqual([held]);
  });

  it('filters Destroyed queries on the traits held at destroy', () => {
    const world = createWorld();
    const Destroyed = createDestroyed();
    const hot = world.spawn(Position, IsHot);
    const cold = world.spawn(Position, IsCold);
    hot.destroy();
    cold.destroy();

    expect(world.query(Destroyed(Position), IsHot).toArray()).toEqual([hot]);
    expect(world.query(Destroyed(Position), Not(IsHot)).toArray()).toEqual([cold]);
  });

  it('emits events that each listener drains once, in order', () => {
    const world = createWorld();
    const listener = createListener(Event);
    const other = createListener(Event, Not(IsHot));
    world.query(listener);
    world.query(other);

    world.emit(Event({ by: 5 }));
    world.emit(Event({ by: 6 }), IsHot);

    const seen: number[] = [];
    world.query(listener).readEach(([event]) => seen.push(event.by));
    expect(seen).toEqual([5, 6]);
    expect(world.query(listener).length).toBe(0);

    expect(world.query(other).length).toBe(1);
    expect(world.query(Event).length).toBe(0);
  });

  it('keeps an event until every listener has consumed it', () => {
    const world = createWorld();
    const fast = createListener(Event);
    const slow = createListener(Event);
    world.query(fast);
    world.query(slow);

    world.emit(Event({ by: 7 }));
    const event = world.query(fast).first!;
    expect(world.query(fast).length).toBe(0);
    expect(event.get(Event)!.by).toBe(7);

    expect(world.query(slow).toArray()).toEqual([event]);
    expect(event.get(Event)!.by).toBe(7);
    expect(world.query(slow).length).toBe(0);
    expect(() => event.get(Event)).toThrow();
  });

  it('drops events a reader fell too far behind to keep', () => {
    const world = createWorld({ retain: 2 });
    const listener = createListener(Event);
    world.query(listener);

    world.emit(Event({ by: 1 }));
    world.emit(Event({ by: 2 }));
    world.emit(Event({ by: 3 }));

    const seen: number[] = [];
    world.query(listener).readEach(([event]) => seen.push(event.by));
    expect(seen).toEqual([2, 3]);
  });

  it('keeps alive and retained entities apart while spawning', () => {
    const world = createWorld();
    const a = world.spawn(Position({ x: 1 }));
    const b = world.spawn(Position({ x: 2 }));
    const c = world.spawn(Position({ x: 3 }));
    a.destroy();
    b.destroy();
    const d = world.spawn(Position({ x: 4 }));
    const e = world.spawn(Position({ x: 5 }));

    expect(world.query(Position).toArray().sort()).toEqual([c, d, e].sort());
    expect(a.get(Position)!.x).toBe(1);
    expect(b.get(Position)!.x).toBe(2);

    const Removed = createRemoved();
    expect(world.query(Removed(Position)).toArray()).toEqual([a, b]);
    expect(world.query(Removed(Position)).length).toBe(0);
    expect(world.query(Position).length).toBe(3);
    const recycled = world.spawn();
    expect([a.id(), b.id()]).toContain(recycled.id());
  });

  it('releases retained entities on reset', () => {
    const world = createWorld();
    const entity = world.spawn(Position);
    entity.destroy();
    world.reset();

    expect(() => entity.get(Position)).toThrow();
    expect(world.query(Position).length).toBe(0);
  });

  it('accepts world traits after the options', () => {
    const world = createWorld({ retain: 8 }, Position({ x: 9 }));
    expect(world.get(Position)?.x).toBe(9);
  });
});
