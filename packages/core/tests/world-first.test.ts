import { describe, expect, it, vi } from 'vitest';
import { createActions, createWorld, identifier, relation, trait, type Entity } from '../src';
import { hasNativeGc, waitForFinalization } from './utils/gc';

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
    expect(world.isAlive(entity)).toBe(false);
    expect(world.has(entity)).toBe(false);
    expect(world.isAlive(other)).toBe(true);
    expect(world.query(Position).length).toBe(1);
  });

  it('never destroys the world when the entity argument is undefined', () => {
    const world = createWorld();
    const entity = world.spawn(Position);
    const missing = undefined as unknown as Entity;

    expect(() => world.destroy(missing)).toThrow(/ENTITY_ALIVE/);
    expect(world.isAlive(entity)).toBe(true);
  });

  it('reports a missing entity instead of applying the call to the world', () => {
    const world = createWorld();
    const missing = world.queryFirst(IsActive) as Entity;

    expect(() => world.add(missing, IsActive)).toThrow(/ENTITY_ALIVE/);
    expect(() => world.remove(missing, IsActive)).toThrow(/ENTITY_ALIVE/);
    expect(() => world.set(missing, Position, { x: 1 })).toThrow(/ENTITY_ALIVE/);
    expect(() => world.get(missing, Position)).toThrow(/ENTITY_ALIVE/);
    expect(() => world.has(missing, Position)).toThrow(/ENTITY_ALIVE/);
    expect(world.has(IsActive)).toBe(false);
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
    expect(world.isAlive(child)).toBe(false);
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

  it('walks a query and writes through the world inside it', () => {
    const world = createWorld();
    for (let i = 0; i < 4; i++) world.spawn(Position({ x: i }));

    world.query(Position).each((position, entity) => {
      position.y = position.x * 2;
      if (position.x === 3) world.add(entity, IsActive);
    });

    const active = world.queryFirst(IsActive)!;
    expect(world.get(active, Position)).toEqual({ x: 3, y: 6 });
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
    expect(a.isAlive(inA)).toBe(false);
    expect(b.isAlive(inB)).toBe(true);
  });

  it('destroys an entity of another world with the same id from inside a destroy', () => {
    const a = createWorld();
    const b = createWorld();
    const inA = a.spawn(Position);
    const inB = b.spawn(Position);
    expect(inA).toBe(inB);

    a.onRemove(Position, () => b.destroy(inB));
    a.destroy(inA);

    expect(a.isAlive(inA)).toBe(false);
    expect(b.isAlive(inB)).toBe(false);
  });

  it('starts over from the first id after a reset and rejects the old ones', () => {
    const world = createWorld();
    const before = world.spawn(Position({ x: 1 }));
    world.reset();
    const after = world.spawn(Position({ x: 2 }));

    expect(after).not.toBe(before);
    expect(after & 0xffffff).toBe(before & 0xffffff);
    expect(world.isAlive(before)).toBe(false);
    expect(world.get(after, Position)!.x).toBe(2);
  });

  it('holds nothing after destroy', () => {
    const world = createWorld();
    const entity = world.spawn(Position);
    const onRemove = vi.fn();
    world.onRemove(Position, onRemove);
    world.destroy();

    expect(onRemove).toHaveBeenCalledWith(entity);
    expect(world.entities.length).toBe(0);
    expect(world.isAlive(entity)).toBe(false);
    expect(world.query(Position).length).toBe(0);
  });

  const actions = createActions((world) => ({ spawn: () => world.spawn(Position) }));

  // Each of these closes a cycle through the world, which a shared table would pin forever.
  const uses: Record<string, (world: ReturnType<typeof createWorld>) => void> = {
    'only spawned into': (world) => void world.spawn(Position),
    'referenced by its own trait subscriber': (world) => {
      world.onAdd(Position, () => void world.has(Position));
      world.spawn(Position);
    },
    'referenced by its own query subscriber': (world) => {
      world.onEnter([Position], () => void world.has(Position));
      world.spawn(Position);
    },
    'referenced by an entity subscriber': (world) => {
      world.onChange(world.spawn(Position), Position, () => void world.has(Position));
    },
    'referenced by its actions': (world) => void actions(world).spawn(),
    'referenced by a trait value': (world) => {
      const Owner = trait(() => ({ world }));
      world.spawn(Owner);
    },
    'referenced by a trait default': (world) => {
      const Owner = trait({ owner: () => world });
      world.spawn(Owner);
    },
  };

  it.skipIf(!hasNativeGc()).each(Object.keys(uses))(
    'is collected without destroy when %s',
    async (use) => {
      await expect(
        waitForFinalization((registry) => {
          (() => {
            const world = createWorld();
            uses[use](world);
            registry.register(world, 'world');
          })();
        })
      ).resolves.toBe(true);
    },
    20_000
  );
});
