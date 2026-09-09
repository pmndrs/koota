import { beforeEach, describe, expect, it } from 'vitest';
import { createWorld, relation, trait, universe, IsExcluded, type Entity } from '../src';
import { hasNativeGc, waitForFinalization } from './utils/gc';

describe('World', () => {
  beforeEach(() => {
    universe.reset();
  });

  it('should create a world', () => {
    const world = createWorld();

    expect(world.isRegistered).toBe(false);
    expect(universe.contexts[world.id]).toBeUndefined();
  });

  it('should auto-register on first mutation', () => {
    const world = createWorld();
    expect(world.isRegistered).toBe(false);
    world.spawn();
    expect(world.isRegistered).toBe(true);
  });

  describe('finalization', () => {
    it.skipIf(!hasNativeGc())(
      'should finalize an unused abandoned world',
      async () => {
        await expect(
          waitForFinalization((registry) => {
            (() => {
              const world = createWorld();
              registry.register(world, 'world');
            })();
          })
        ).resolves.toBe(true);
      },
      20_000
    );

    it.skipIf(!hasNativeGc())(
      'should finalize a used abandoned world',
      async () => {
        let worldId = -1;
        let ownedPages: number[] = [];
        let removed = 0;
        const Resource = trait(undefined, {
          onRemove() {
            removed++;
          },
        });

        await expect(
          waitForFinalization((registry) => {
            (() => {
              const world = createWorld();
              world.spawn(Resource);
              world.query(IsExcluded);
              worldId = world.id;
              ownedPages = [...universe.contexts[world.id]!.entityIndex.ownedPages];
              registry.register(world, 'world');
            })();
          })
        ).resolves.toBe(true);

        await expect.poll(() => universe.contexts[worldId]).toBeUndefined();
        expect(removed).toBe(0);
        for (const pageId of ownedPages) {
          expect(universe.pageAllocator.pageOwners[pageId]).toBeNull();
          expect(universe.pageAllocator.pageAliveCounts[pageId]).toBe(0);
          expect(universe.pageAllocator.freePages).toContain(pageId);
        }
      },
      20_000
    );
  });

  it('should reset the world', () => {
    const world = createWorld();
    world.spawn();
    world.reset();

    // Always has one entity that is the world itself.
    expect(world.entities.length).toBe(1);
  });

  it('keeps its backing entity out of queries and entity lifecycle notifications', () => {
    const world = createWorld();
    const spawned: Entity[] = [];
    const destroyed: Entity[] = [];
    world.onEntitySpawn((entity) => spawned.push(entity));
    world.onEntityDestroy((entity) => destroyed.push(entity));
    expect(world.isRegistered).toBe(false);

    const first = world.spawn();
    expect([...world.query()]).toEqual([first]);
    world.reset();
    expect([...world.query()]).toEqual([]);
    const second = world.spawn();
    world.destroy();

    expect(world.entities).toEqual([]);
    expect(spawned).toEqual([first, second]);
    expect(destroyed).toEqual([first, second]);
  });

  it('recreates world trait storage and the command buffer default target after reset', () => {
    const Time = trait({ value: 0 });
    const world = createWorld(Time({ value: 1 }));
    try {
      expect(world.get(Time)).toEqual({ value: 1 });
      const oldCommands = world.createCommandBuffer();
      oldCommands.set(Time, { value: 2 });
      world.reset();
      expect(world.has(Time)).toBe(false);
      expect(() => world.flush(oldCommands)).toThrow('reset or destroyed');

      const commands = world.createCommandBuffer();
      commands.add(Time({ value: 3 }));
      commands.set(Time, { value: 4 });
      world.flush(commands);
      expect(world.get(Time)).toEqual({ value: 4 });
      expect([...world.query(Time)]).toEqual([]);
      commands.remove(Time);
      world.flush(commands);
      expect(world.has(Time)).toBe(false);
    } finally {
      world.destroy();
    }
  });

  it('reset should remove entities with auto-destroy relations', () => {
    const Node = trait();
    const ChildOf = relation({ autoDestroy: 'orphan', exclusive: true });

    const world = createWorld();

    // Create a parent node and a child node.
    const parentNode = world.spawn(Node);
    world.spawn(Node, ChildOf(parentNode));

    // Expect this to not throw, since the ChildOf relation will automatically
    // remove the child node when the parent node is destroyed first.
    expect(() => world.reset()).not.toThrow();

    // Always has one entity that is the world itself.
    expect(world.entities.length).toBe(1);
  });

  it('destroy should lead to entities with auto-destroy relations being removed as well', () => {
    const Node = trait();
    const ChildOf = relation({ autoDestroy: 'orphan', exclusive: true });

    const world = createWorld();

    // Create a parent node and two child nodes
    const parentNode = world.spawn(Node);
    world.spawn(Node, ChildOf(parentNode));
    world.spawn(Node, ChildOf(parentNode));

    // Expect this to not throw, since the ChildOf relation will automatically
    // remove the child node when the parent node is destroyed first
    expect(() => world.destroy()).not.toThrow();
  });

  it('can create many worlds', () => {
    const worlds = [];
    for (let i = 0; i < 200; i++) {
      worlds.push(createWorld());
    }
    expect(worlds.length).toBe(200);
  });

  it('should add, remove and get singletons', () => {
    const Test = trait({ last: 0, delta: 0 });

    const world = createWorld(Test);
    expect(world.has(Test)).toBe(true);

    const { last: then, delta } = world.get(Test)!;
    expect(then).toBe(0);
    expect(delta).toBe(0);

    const Time = trait({ last: 0, delta: 0 });

    world.add(Time);
    expect(world.has(Time)).toBe(true);
    expect(world.has(Test)).toBe(true);

    // Does not show up in a query.
    const query = world.query(Time);
    expect(query.length).toBe(0);

    const time = world.get(Time)!;
    time.last = 1;
    time.delta = 1;
    world.set(Time, time);

    expect(time.last).toBe(1);
    expect(time.delta).toBe(1);

    world.remove(Time);
    expect(world.has(Time)).toBe(false);
  });

  it('should set singletons', () => {
    const Test = trait({ last: 0, delta: 0 });
    const world = createWorld(Test);

    world.set(Test, { last: 1, delta: 1 });

    expect(world.get(Test)!.last).toBe(1);
    expect(world.get(Test)!.delta).toBe(1);

    // Use callbacks to set.
    world.set(Test, (prev) => {
      return { last: prev.last + 1, delta: prev.delta + 1 };
    });

    expect(world.get(Test)!.last).toBe(2);
    expect(world.get(Test)!.delta).toBe(2);
  });
});
