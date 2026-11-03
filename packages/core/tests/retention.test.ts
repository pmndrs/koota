import { describe, expect, it } from 'vitest';
import {
  Not,
  On,
  createAdded,
  createListener,
  createRemoved,
  createWorld,
  relation,
  trait,
} from '../src';

const Position = trait({ x: 0, y: 0 });
const IsHot = trait();
const IsCold = trait();
const Event = trait({ by: 0 });

describe('Entity retention', () => {
  it('keeps a destroyed entity readable until its id is reused', () => {
    const world = createWorld({ retain: 1 });
    const Removed = createRemoved();
    world.query(Removed(Position));

    const entity = world.spawn(Position({ x: 1 }), IsHot);
    entity.destroy();

    expect(entity.isAlive()).toBe(false);
    expect(world.has(entity)).toBe(false);
    expect(world.entities).not.toContain(entity);
    expect(world.query(Position).length).toBe(0);
    expect(entity.has(Position)).toBe(true);
    expect(entity.get(Position)).toEqual({ x: 1, y: 0 });
    expect(() => entity.set(Position, { x: 2 })).toThrow();
    expect(() => entity.add(IsCold)).toThrow();
    expect(() => entity.remove(IsHot)).toThrow();
    expect(() => entity.destroy()).toThrow();

    // Within the window the id is not reused, so a spawn takes a fresh one.
    const fresh = world.spawn();
    expect(fresh.id()).not.toBe(entity.id());
    expect(entity.get(Position)).toEqual({ x: 1, y: 0 });

    // A second destroy puts the first past the window, but the reader has not moved past it.
    const second = world.spawn(Position({ x: 2 }));
    second.destroy();
    expect(world.query(Removed(Position)).toArray()).toEqual([entity, second]);
    expect(world.spawn().id()).not.toBe(entity.id());

    // The reader's second run moves past both, and the oldest id is reused first.
    expect(world.query(Removed(Position)).length).toBe(0);
    expect(world.spawn().id()).toBe(entity.id());
    expect(() => entity.get(Position)).toThrow();
    expect(second.get(Position)!.x).toBe(2);
  });

  it('releases a destroyed entity at once on a world that retains nothing', () => {
    const world = createWorld({ retain: 0 });
    const entity = world.spawn(Position({ x: 1 }));
    entity.destroy();

    expect(() => entity.get(Position)).toThrow();
    expect(world.spawn().id()).toBe(entity.id());
    expect(() => world.emit(Event({ by: 1 }))).toThrow();
    expect(() => world.spawn(Event({ by: 1 }), On(world.spawn()))).toThrow();
  });

  it('reuses the oldest id past the window when nothing reads', () => {
    const world = createWorld({ retain: 2 });
    const a = world.spawn(Position({ x: 1 }));
    const b = world.spawn(Position({ x: 2 }));
    const c = world.spawn(Position({ x: 3 }));
    a.destroy();
    b.destroy();
    c.destroy();

    expect(a.get(Position)!.x).toBe(1);
    const reused = world.spawn(Position({ x: 4 }));
    expect(reused.id()).toBe(a.id());
    expect(reused).not.toBe(a);
    expect(() => a.get(Position)).toThrow();
    expect(b.get(Position)!.x).toBe(2);
    expect(c.get(Position)!.x).toBe(3);
    expect(world.spawn().id()).not.toBe(b.id());
  });

  it('reuses ids a stalled reader never consumed once the backstop is reached', () => {
    const world = createWorld({ retain: 1 });
    const Removed = createRemoved();
    world.query(Removed(Position));

    const first = world.spawn(Position);
    first.destroy();
    for (let i = 0; i < 16; i++) world.spawn(Position).destroy();

    expect(world.spawn().id()).toBe(first.id());
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
  });

  it('does not seed an Added query from a destroyed entity', () => {
    const world = createWorld();
    world.spawn(Position).destroy();

    const Added = createAdded();
    expect(world.query(Added(Position)).length).toBe(0);
  });

  it('tracks destroys through Removed, told apart from live removes by liveness', () => {
    const world = createWorld();
    const Removed = createRemoved();
    expect(world.query(Removed(Position)).length).toBe(0);

    const held = world.spawn(Position({ x: 3 }));
    const dropped = world.spawn(Position({ x: 4 }));
    dropped.remove(Position);
    held.destroy();

    const removed = world.query(Removed(Position));
    expect(removed.toArray()).toEqual([dropped, held]);
    expect(removed.toArray().map((entity) => entity.isAlive())).toEqual([true, false]);
    expect(removed.toArray().map((entity) => entity.get(Position)!.x)).toEqual([4, 3]);
    expect(world.query(Removed(Position)).length).toBe(0);
  });

  it('emits events that each listener drains once, in order', () => {
    const world = createWorld();
    const listener = createListener(Event);
    const other = createListener(Event, Not(IsHot));

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
    const world = createWorld({ retain: 1 });
    const fast = createListener(Event);
    const slow = createListener(Event);
    world.query(fast);
    world.query(slow);

    world.emit(Event({ by: 7 }));
    world.emit(Event({ by: 8 }));
    const event = world.query(fast).first!;
    expect(world.query(fast).length).toBe(0);
    expect(event.get(Event)!.by).toBe(7);

    // The slow listener has not moved past it, so the next event does not take its id.
    expect(world.emit(Event({ by: 9 })).id()).not.toBe(event.id());
    expect(world.query(slow).toArray()).toContain(event);
    expect(world.query(slow).length).toBe(0);
    expect(world.query(fast).length).toBe(1);
    expect(world.emit(Event({ by: 10 })).id()).toBe(event.id());
    expect(() => event.get(Event)).toThrow();
  });

  it('reads the last value of a removed trait until it is added back', () => {
    const world = createWorld();
    const Removed = createRemoved();
    world.query(Removed(Position));
    const entity = world.spawn(Position({ x: 5 }));

    entity.remove(Position);
    expect(entity.has(Position)).toBe(false);
    expect(entity.get(Position)).toEqual({ x: 5, y: 0 });
    expect(world.query(Removed(Position)).toArray()).toEqual([entity]);

    entity.remove(Position);
    entity.add(Position({ x: 7 }));
    expect(entity.get(Position)!.x).toBe(7);
    expect(world.query(Removed(Position)).length).toBe(0);
  });

  it('matches the other terms of a Removed query on what a destroyed entity died with', () => {
    const world = createWorld();
    const Warm = createRemoved();
    world.query(Warm(Position), IsHot);
    const hot = world.spawn(Position, IsHot);
    const cold = world.spawn(Position, IsCold);
    hot.destroy();
    cold.destroy();

    expect(world.query(Warm(Position), IsHot).toArray()).toEqual([hot]);
    expect(world.query(createRemoved()(Position), IsHot).toArray()).toEqual([hot]);
    expect(world.query(createRemoved()(Position), Not(IsHot)).toArray()).toEqual([cold]);
  });

  it('drains events only through Removed readers that name the subject', () => {
    const world = createWorld();
    const Warm = createRemoved();
    const Plain = createRemoved();
    world.query(Warm(Event), On('*'));
    world.query(Plain(Event));
    const event = world.emit(Event({ by: 15 }));

    expect(world.query(Warm(Event), On('*')).toArray()).toEqual([event]);
    expect(world.query(Plain(Event)).length).toBe(0);
    expect(world.query(createRemoved()(Event), On('*')).toArray()).toEqual([event]);
    expect(world.query(createRemoved()(Event)).length).toBe(0);
    expect(world.query(Warm(Event), On('*')).length).toBe(0);
  });

  it('gives every event a subject', () => {
    const world = createWorld();
    const player = world.spawn(IsHot);
    const bystander = world.spawn();
    const listener = createListener(Event);
    world.query(listener);

    const fromWorld = world.emit(Event({ by: 1 }));
    const fromPlayer = player.emit(Event({ by: 2 }));
    const explicit = world.emit(Event({ by: 3 }), On(player));

    expect(fromWorld.has(On('*'))).toBe(true);
    expect(fromWorld.targetFor(On)).not.toBe(player);
    expect(fromPlayer.targetFor(On)).toBe(player);
    expect(explicit.targetFor(On)).toBe(player);
    expect(world.query(listener).toArray()).toEqual([fromWorld, fromPlayer, explicit]);
    expect(world.query(createListener(Event, On(player))).toArray()).toEqual([fromPlayer, explicit]);
    expect(world.query(createListener(Event, On(IsHot))).toArray()).toEqual([fromPlayer, explicit]);
    expect(world.query(createListener(Event, On(bystander))).length).toBe(0);
  });

  it('ends an entity as an event when it gains a subject', () => {
    const world = createWorld({ retain: 1 });
    const target = world.spawn();
    const listener = createListener(Event);
    world.query(listener);
    let removed = 0;
    world.onRemove(Event, () => removed++);

    const spawned = world.spawn(Event({ by: 20 }), On(target), IsHot);
    expect(spawned.isAlive()).toBe(false);
    expect(spawned.has(IsHot)).toBe(true);
    expect(spawned.get(Event)).toEqual({ by: 20 });
    expect(spawned.targetFor(On)).toBe(target);
    expect(world.query(Event).length).toBe(0);

    const promoted = world.spawn(Event({ by: 21 }));
    expect(world.query(Event).length).toBe(1);
    promoted.add(On(target));
    expect(promoted.isAlive()).toBe(false);
    expect(world.query(Event).length).toBe(0);
    expect(removed).toBe(2);
    expect(() => world.add(On(target))).toThrow();

    expect(world.query(listener).toArray()).toEqual([spawned, promoted]);
    expect(world.query(listener).length).toBe(0);
    // Only emits reuse the ids of rows that ended as events
    expect(world.spawn().id()).not.toBe(spawned.id());
    expect(world.emit(Event({ by: 22 })).id()).toBe(spawned.id());
  });

  it('keeps events through entity churn and never hands their ids to spawns', () => {
    const world = createWorld({ retain: 2 });
    const event = world.emit(Event({ by: 11 }));
    for (let i = 0; i < 500; i++) world.spawn(Position).destroy();
    for (let i = 0; i < 100; i++) expect(world.spawn().id()).not.toBe(event.id());

    const listener = createListener(Event);
    expect(world.query(listener).toArray()).toEqual([event]);
    expect(event.get(Event)!.by).toBe(11);
  });

  it('never makes an event alive', () => {
    const world = createWorld();
    let observed = 0;
    world.onAdd(Event, () => observed++);
    const event = world.emit(Event({ by: 12 }), IsHot);

    expect(observed).toBe(1);
    expect(world.has(event)).toBe(false);
    expect(world.entities).not.toContain(event);
    expect(world.query(Event).length).toBe(0);
    expect(world.query(IsHot).length).toBe(0);
    expect(event.get(Event)).toEqual({ by: 12 });
    expect(event.has(IsHot)).toBe(true);
    expect(() => event.set(Event, { by: 0 })).toThrow();
  });

  it('filters events on their pairs and other traits', () => {
    const Hits = relation();
    const world = createWorld();
    const a = world.spawn();
    const b = world.spawn();
    const Warm = createRemoved();
    world.query(Warm(Event), On('*'), Hits(a));
    const onA = world.emit(Event({ by: 13 }), Hits(a), IsHot);
    world.emit(Event({ by: 14 }), Hits(b));

    expect(world.query(Warm(Event), On('*'), Hits(a)).toArray()).toEqual([onA]);
    expect(world.query(createListener(Event, Hits(a))).toArray()).toEqual([onA]);
    expect(world.query(createListener(Event, IsHot)).toArray()).toEqual([onA]);
    expect(onA.targetFor(Hits)).toBe(a);
  });

  it('drops events a reader fell too far behind to keep', () => {
    const world = createWorld({ retain: 1 });
    const listener = createListener(Event);
    world.query(listener);

    for (let i = 1; i <= 40; i++) world.emit(Event({ by: i }));

    const seen: number[] = [];
    world.query(listener).readEach(([event]) => seen.push(event.by));
    expect(seen.length).toBeLessThan(40);
    expect(seen.at(-1)).toBe(40);
    for (let i = 1; i < seen.length; i++) expect(seen[i]).toBe(seen[i - 1] + 1);
  });

  it('keeps alive and destroyed entities apart while spawning', () => {
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
  });

  it('releases destroyed entities on reset', () => {
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

const ChildOf = relation({ autoDestroy: 'orphan' });
const Likes = relation();
const Weighs = relation({ store: { kg: 0 } });

describe('Relation retention', () => {
  it('matches Removed queries on the pairs held at destroy, warm and cold', () => {
    const world = createWorld();
    const a = world.spawn();
    const b = world.spawn();
    const childA = world.spawn(Likes(a));
    const childB = world.spawn(Likes(b));
    const Warm = createRemoved();
    expect(world.query(Warm(Likes), Likes(a)).length).toBe(0);

    childA.destroy();
    childB.destroy();

    expect(world.query(Warm(Likes), Likes(a)).toArray()).toEqual([childA]);
    expect(world.query(createRemoved()(Likes), Likes(a)).toArray()).toEqual([childA]);
    expect(world.query(createRemoved()(Likes), Likes('*')).toArray()).toEqual([childA, childB]);
  });

  it('keeps targets and pair data readable on a destroyed entity', () => {
    const world = createWorld();
    const a = world.spawn();
    const b = world.spawn();
    const entity = world.spawn(Weighs(a, { kg: 7 }), Weighs(b, { kg: 9 }));
    entity.destroy();

    expect(entity.targetsFor(Weighs)).toEqual([a, b]);
    expect(entity.targetFor(Weighs)).toBe(a);
    expect(entity.has(Weighs(b))).toBe(true);
    expect(entity.get(Weighs(b))).toEqual({ kg: 9 });
    expect(world.query(Weighs(a)).length).toBe(0);
    expect(() => entity.remove(Weighs(a))).toThrow();
  });

  it('keeps the parent on children destroyed with it', () => {
    const world = createWorld();
    const parent = world.spawn();
    const child = world.spawn(ChildOf(parent));
    parent.destroy();

    expect(world.has(child)).toBe(false);
    expect(child.targetFor(ChildOf)).toBe(parent);
    expect(world.query(createRemoved()(ChildOf), ChildOf(parent)).toArray()).toEqual([child]);
  });

  it('drops the pair from a live source when its target dies', () => {
    const world = createWorld();
    const target = world.spawn();
    const source = world.spawn(Likes(target));
    target.destroy();

    expect(source.has(Likes('*'))).toBe(false);
    expect(source.targetFor(Likes)).toBeUndefined();
  });

  it('clears relation data when the id is reused', () => {
    const world = createWorld({ retain: 1 });
    const a = world.spawn();
    const first = world.spawn(Weighs(a, { kg: 7 }));
    const second = world.spawn(Weighs(a, { kg: 8 }));
    first.destroy();
    second.destroy();

    const reused = world.spawn();
    expect(reused.id()).toBe(first.id());
    expect(reused.has(Weighs('*'))).toBe(false);
    expect(reused.targetsFor(Weighs)).toEqual([]);
    expect(second.get(Weighs(a))).toEqual({ kg: 8 });

    reused.add(Weighs(a, { kg: 1 }));
    expect(reused.targetsFor(Weighs)).toEqual([a]);
    expect(reused.get(Weighs(a))).toEqual({ kg: 1 });
  });
});
