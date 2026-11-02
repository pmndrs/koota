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

describe('Entity retention', () => {
  it('releases a destroyed entity at once on an eager world', () => {
    const world = createWorld();
    const entity = world.spawn(Position({ x: 1 }));
    entity.destroy();

    expect(entity.isAlive()).toBe(false);
    expect(() => entity.get(Position)).toThrow();
    world.collect();
    expect(world.spawn().id()).toBe(entity.id());
  });

  it('keeps a destroyed entity readable until collect on a manual world', () => {
    const world = createWorld({ collect: 'manual' });
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

    world.collect();
    expect(() => entity.get(Position)).toThrow();
  });

  it('seeds a Removed query created after a destroy from the retained entity', () => {
    const world = createWorld({ collect: 'manual' });
    const kept = world.spawn(Position({ x: 1 }));
    const gone = world.spawn(Position({ x: 2 }));
    gone.destroy();

    const Removed = createRemoved();
    const removed = world.query(Removed(Position));
    expect(removed.toArray()).toEqual([gone]);
    removed.forEach((entity) => expect(entity.get(Position)!.x).toBe(2));
    expect(world.query(Removed(Position)).length).toBe(0);
    expect(kept.isAlive()).toBe(true);

    world.collect();
    const Later = createRemoved();
    expect(world.query(Later(Position)).length).toBe(0);
  });

  it('does not seed a Removed query from an entity an eager world already released', () => {
    const world = createWorld();
    world.spawn(Position).destroy();

    const Removed = createRemoved();
    expect(world.query(Removed(Position)).length).toBe(0);
  });

  it('does not seed an Added query from a retained entity', () => {
    const world = createWorld({ collect: 'manual' });
    world.spawn(Position).destroy();

    const Added = createAdded();
    expect(world.query(Added(Position)).length).toBe(0);
  });

  it('tracks entities destroyed while holding the trait with Destroyed', () => {
    const world = createWorld({ collect: 'manual' });
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
    const world = createWorld({ collect: 'manual' });
    const held = world.spawn(Position({ x: 3 }));
    world.spawn(Position);
    held.destroy();

    const Destroyed = createDestroyed();
    expect(world.query(Destroyed(Position)).toArray()).toEqual([held]);
  });

  it('filters Destroyed queries on the traits held at destroy', () => {
    const world = createWorld({ collect: 'manual' });
    const Destroyed = createDestroyed();
    const hot = world.spawn(Position, IsHot);
    const cold = world.spawn(Position, IsCold);
    hot.destroy();
    cold.destroy();

    expect(world.query(Destroyed(Position), IsHot).toArray()).toEqual([hot]);
    expect(world.query(Destroyed(Position), Not(IsHot)).toArray()).toEqual([cold]);
  });

  it('emits events that listeners drain once each', () => {
    const world = createWorld({ collect: 'manual' });
    const listener = createListener(Event);
    const other = createListener(Event, Not(IsHot));

    world.emit(Event({ by: 5 }));
    world.emit(Event({ by: 6 }), IsHot);

    const events = world.query(listener);
    expect(events.length).toBe(2);
    const seen: number[] = [];
    events.readEach(([event]) => seen.push(event.by));
    expect(seen.sort()).toEqual([5, 6]);
    expect(world.query(listener).length).toBe(0);

    expect(world.query(other).length).toBe(1);
    world.collect();
    expect(world.query(Event).length).toBe(0);
  });

  it('only fires synchronous subscribers for emit on an eager world', () => {
    const world = createWorld();
    const listener = createListener(Event);
    const seen: number[] = [];
    world.onAdd(Event, (entity) => seen.push(entity.get(Event)!.by));

    world.emit(Event({ by: 7 }));
    expect(seen).toEqual([7]);
    expect(world.query(listener).length).toBe(0);
  });

  it('recycles ids and clears history after collect', () => {
    const world = createWorld({ collect: 'manual' });
    const entity = world.spawn(Position);
    entity.destroy();
    world.collect();

    const next = world.spawn();
    expect(next.id()).toBe(entity.id());
    expect(next).not.toBe(entity);
    expect(entity.isAlive()).toBe(false);

    const Removed = createRemoved();
    expect(world.query(Removed(Position)).length).toBe(0);
    const Destroyed = createDestroyed();
    expect(world.query(Destroyed(Position)).length).toBe(0);
  });

  it('keeps alive and retained entities apart while spawning', () => {
    const world = createWorld({ collect: 'manual' });
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
    expect(world.query(Removed(Position)).toArray().sort()).toEqual([a, b].sort());

    world.collect();
    expect(world.query(Position).length).toBe(3);
    const recycled = world.spawn();
    expect([a.id(), b.id()]).toContain(recycled.id());
  });

  it('releases retained entities on reset', () => {
    const world = createWorld({ collect: 'manual' });
    const entity = world.spawn(Position);
    entity.destroy();
    world.reset();

    expect(() => entity.get(Position)).toThrow();
    expect(world.query(Position).length).toBe(0);
  });

  it('accepts world traits after the options', () => {
    const world = createWorld({ collect: 'manual' }, Position({ x: 9 }));
    expect(world.get(Position)?.x).toBe(9);
  });
});
