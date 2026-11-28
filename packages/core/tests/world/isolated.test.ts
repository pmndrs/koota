import { describe, expect, it, vi } from 'vitest';
import { createActions, identifier, machine, relation, trait, type Entity } from '../../src';
import { createWorld } from '../../src/isolated';
import { hasNativeGc, waitForFinalization } from '../utils/gc';

const Position = trait({ x: 0, y: 0 });
const IsActive = trait();
const Time = trait({ delta: 0 });
const ChildOf = relation({ autoDestroy: 'orphan' });
const Name = identifier();

describe('World-first entities', () => {
  it('reads and writes traits through the world', () => {
    const world = createWorld();
    const entity = world.spawn(Position({ x: 1 }));

    expect(world.has(entity, Position)).toBe(true);
    expect(world.get(entity, Position)).toEqual({ x: 1, y: 0 });

    world.set(entity, Position, { x: 2, y: 3 });
    world.set(entity, Position, (prev) => ({ ...prev, y: prev.y + 1 }));
    expect(world.get(entity, Position)).toEqual({ x: 2, y: 4 });

    const out = { x: 0, y: 0 };
    expect(world.get(entity, Position, out)).toBe(out);
    expect(out).toEqual({ x: 2, y: 4 });

    world.add(entity, IsActive);
    expect(world.has(entity, IsActive)).toBe(true);
    world.remove(entity, IsActive, Position);
    expect(world.has(entity, IsActive)).toBe(false);
    expect(world.has(entity, Position)).toBe(false);

    world.upsert(entity, Position, { x: 5 });
    world.upsert(entity, Position, { x: 6 });
    expect(world.get(entity, Position)).toEqual({ x: 6, y: 0 });
  });

  it('gives entities no methods', () => {
    const world = createWorld();
    const entity = world.spawn(Position);
    expect(typeof entity).toBe('number');
    expect((entity as unknown as { get?: unknown }).get).toBeUndefined();
  });

  it('keeps the forms without an entity for the world itself', () => {
    const world = createWorld();
    world.add(Time);
    world.set(Time, { delta: 16 });
    expect(world.has(Time)).toBe(true);
    expect(world.get(Time)).toEqual({ delta: 16 });

    const entity = world.spawn(Time({ delta: 1 }));
    expect(world.get(entity, Time)).toEqual({ delta: 1 });
    world.remove(Time);
    expect(world.has(Time)).toBe(false);
    expect(world.has(entity, Time)).toBe(true);
  });

  it('destroys an entity without touching the world', () => {
    const world = createWorld();
    const entity = world.spawn(Position);
    const other = world.spawn(Position);

    world.destroy(entity);
    expect(world.has(entity)).toBe(false);
    expect(world.has(entity)).toBe(false);
    expect(world.has(other)).toBe(true);
    expect(world.query(Position).length).toBe(1);
  });

  it('never reads a missing entity as the world or a missing trait as a liveness check', () => {
    const world = createWorld();
    const entity = world.spawn(Position);
    const missing = undefined as unknown as Entity;
    const missingTrait = undefined as unknown as typeof Position;

    // A missing entity is a dead entity.
    expect(() => world.destroy(missing)).toThrow(/ENTITY_ALIVE/);
    expect(() => world.add(missing, IsActive)).toThrow(/ENTITY_ALIVE/);
    expect(() => world.get(missing, Position)).toThrow(/ENTITY_ALIVE/);
    expect(world.has(entity)).toBe(true);
    expect(world.has(IsActive)).toBe(false);
    expect(() => world.has(entity, missingTrait)).toThrow();
  });

  it('reads relation targets and identifiers through the world', () => {
    const world = createWorld();
    const parent = world.spawn(Name('root'));
    const child = world.spawn(ChildOf(parent));

    expect(world.targetFor(child, ChildOf)).toBe(parent);
    expect(world.targetsFor(child, ChildOf)).toEqual([parent]);
    expect(world.has(child, ChildOf(parent))).toBe(true);
    expect(world.targetFor(parent, Name)).toBe('root');
    expect(world.query(ChildOf(parent)).toArray()).toEqual([child]);

    world.destroy(parent);
    expect(world.has(child)).toBe(false);
  });

  it('subscribes to one entity when the entity comes first', () => {
    const world = createWorld();
    const watched = world.spawn(Position);
    const other = world.spawn(Position);
    const onEntity = vi.fn();
    const onWorld = vi.fn();

    const unsubscribe = world.onChange(watched, Position, onEntity);
    world.onChange(Position, onWorld);

    world.set(watched, Position, { x: 1 });
    world.set(other, Position, { x: 1 });
    expect(onEntity).toHaveBeenCalledTimes(1);
    expect(onEntity).toHaveBeenCalledWith(watched);
    expect(onWorld).toHaveBeenCalledTimes(2);

    unsubscribe();
    world.changed(watched, Position);
    expect(onEntity).toHaveBeenCalledTimes(1);
    expect(onWorld).toHaveBeenCalledTimes(3);
  });

  it('runs a machine through the world', () => {
    const Idle = trait();
    const Busy = trait({ job: 0 });
    const Work = machine({ states: { Idle, Busy }, initial: Idle });
    const world = createWorld();
    const entity = world.spawn(Work);

    expect(Work.current(world, entity)).toBe(Idle);
    Work.enter(world, entity, Busy({ job: 3 }));
    expect(Work.current(world, entity)).toBe(Busy);
    expect(world.get(entity, Busy)).toEqual({ job: 3 });
  });
});

describe('Isolated worlds', () => {
  it('gives each world its own ids', () => {
    const a = createWorld();
    const b = createWorld();
    const inA = a.spawn(Position({ x: 1 }));
    const inB = b.spawn(Position({ x: 2 }));

    expect(inA).toBe(inB);
    expect(a.get(inA, Position)!.x).toBe(1);
    expect(b.get(inB, Position)!.x).toBe(2);

    a.destroy(inA);
    expect(a.has(inA)).toBe(false);
    expect(b.has(inB)).toBe(true);
  });

  it.skipIf(!hasNativeGc())(
    'is collected once dropped, without destroy',
    async () => {
      const actions = createActions((world) => ({ spawn: () => world.spawn(Position) }));
      await expect(
        waitForFinalization((registry) => {
          (() => {
            const world = createWorld();
            // Subscribers and actions that refer back to their world do not keep it alive.
            world.onAdd(Position, () => void world.has(Position));
            world.onEnter([Position], () => void world.has(Position));
            actions(world).spawn();
            registry.register(world, 'world');
          })();
        })
      ).resolves.toBe(true);
    },
    20_000
  );

  it.skipIf(!hasNativeGc())(
    'releases relation target lists when the world is dropped',
    async () => {
      await expect(
        waitForFinalization((registry) => {
          const world = createWorld();
          const parent = world.spawn();
          world.spawn(ChildOf(parent));
          world.query(ChildOf('*')).each((targets) => registry.register(targets, 'targets'));
        })
      ).resolves.toBe(true);
    },
    20_000
  );
});
