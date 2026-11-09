import { describe, expect, it } from 'vitest';
import { $internal, relation, trait, type Entity, type World } from '../src';
import { createWorld } from '../src/entity-methods';

describe('World', () => {
  it('should create a world with its world entity', () => {
    const world = createWorld();

    expect(world.entities).toEqual([world[$internal].worldEntity]);
  });

  it('is final once destroyed', () => {
    const Time = trait({ delta: 0 });
    const world = createWorld();
    world.add(Time);
    world.destroy();
    world.destroy();

    expect(world.entities.length).toBe(0);
    expect(world.has(Time)).toBe(false);
    expect(world.get(Time)).toBeUndefined();
    expect(() => world.spawn()).toThrow(/destroyed/);
    expect(() => world.add(Time)).toThrow(/destroyed/);
    expect(() => world.reset()).toThrow(/destroyed/);
  });

  it('releases its pages on destroy so another world can lease them', () => {
    const world = createWorld();
    const entity = world.spawn();
    const allocator = world[$internal].entityIndex.allocator;
    const ownedPages = [...world[$internal].entityIndex.ownedPages];
    world.destroy();

    for (const pageId of ownedPages) {
      expect(allocator.pageOwners[pageId]).toBeNull();
      expect(allocator.freePages).toContain(pageId);
    }
    expect(entity.isAlive()).toBe(false);
  });

  it('should reset the world', () => {
    const world = createWorld();
    world.spawn();
    world.reset();

    // Always has one entity that is the world itself.
    expect(world.entities.length).toBe(1);
  });

  it.each(['reset', 'destroy'] as const)(
    '%s invalidates live and retained handles before their page is reused',
    (operation) => {
      const Value = trait({ value: 0 });
      const world = createWorld();
      // The world entity takes the first slot, so these spill onto a second page.
      const entities = Array.from({ length: 1024 }, () => world.spawn(Value));
      entities[1].destroy();
      world[operation]();

      // The freed pages go to whichever world leases next, so spawn into both and find the ids.
      const replacementWorld = createWorld();
      const owners = operation === 'reset' ? [world, replacementWorld] : [replacementWorld];
      const replacements = new Map<number, { entity: Entity; owner: World }>();
      for (const owner of owners) {
        for (let i = 0; i < 2047; i++) {
          const entity = owner.spawn(Value({ value: 9 }));
          replacements.set(entity.id(), { entity, owner });
        }
      }
      for (const stale of entities.slice(0, 2)) {
        const { entity: replacement, owner } = replacements.get(stale.id())!;
        expect(replacement).not.toBe(stale);
        expect(stale.isAlive()).toBe(false);
        expect(owner.has(stale)).toBe(false);
        expect(() => stale.get(Value)).toThrow();
        expect(() => stale.set(Value, { value: 1 })).toThrow();
        expect(replacement.get(Value)).toEqual({ value: 9 });
      }
      replacementWorld.destroy();
      world.destroy();
    }
  );

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

    const world = createWorld();
    world.add(Test);
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
    const world = createWorld();
    world.add(Test);

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

  it('should upsert singletons', () => {
    const Test = trait({ last: 0, delta: 0 });
    const world = createWorld();

    world.upsert(Test, { last: 1 });
    expect(world.get(Test)).toEqual({ last: 1, delta: 0 });

    world.upsert(Test, { delta: 2 });
    expect(world.get(Test)).toEqual({ last: 1, delta: 2 });
  });
});
