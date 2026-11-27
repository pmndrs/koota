import { describe, expect, it } from 'vitest';
import { createWorld, relation, trait, type Entity, type World } from '../../src';

describe('World', () => {
  it('should create a world with its world entity', () => {
    const world = createWorld();

    expect(world.entities.length).toBe(1);
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

  it('keeps trait membership independent across worlds', () => {
    const Selected = trait();
    const first = createWorld();
    const second = createWorld();
    const firstEntity = first.spawn(Selected);
    const secondEntity = second.spawn();

    expect(secondEntity.has(Selected)).toBe(false);
    secondEntity.add(Selected);
    firstEntity.remove(Selected);
    expect(firstEntity.has(Selected)).toBe(false);
    first.destroy();

    expect(secondEntity.has(Selected)).toBe(true);
    expect(second.query(Selected).toArray()).toEqual([secondEntity]);
    second.destroy();
  });

  it('leaves live entities alone when cleaning up a destroyed world', () => {
    const Tag = trait();
    const world = createWorld();
    const stale = world.spawn(Tag);
    world.destroy();

    const other = createWorld();
    const replacement = other.spawn(Tag);
    const matches = other.query(Tag);

    expect(world.query(Tag)).toHaveLength(0);
    world.remove(stale, Tag);

    expect(replacement.has(Tag)).toBe(true);
    expect(matches.toArray()).toEqual([replacement]);
    other.destroy();
  });

  it('finds nothing left to destroy or remove on an entity once destroyed', () => {
    const Tag = trait();
    const Link = relation();
    const world = createWorld();
    const target = world.spawn();
    const entity = world.spawn(Tag, Link(target));
    world.destroy();

    expect(() => world.destroy(entity)).not.toThrow();
    expect(() => world.remove(entity, Tag, Link(target), Link('*'))).not.toThrow();
    expect(() => world.add(entity, Tag)).toThrow(/does not exist/);
    expect(() => entity.destroy()).not.toThrow();
    expect(() => entity.remove(Tag, Link(target))).not.toThrow();
    expect(() => entity.add(Tag)).toThrow(/does not exist/);
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

  it.each(['reset', 'destroy'] as const)(
    '%s should remove entities with auto-destroy relations',
    (operation) => {
      const Node = trait();
      const ChildOf = relation({ autoDestroy: 'orphan', exclusive: true });

      const world = createWorld();

      // Create a parent node and two child nodes.
      const parentNode = world.spawn(Node);
      world.spawn(Node, ChildOf(parentNode));
      world.spawn(Node, ChildOf(parentNode));

      // Expect this to not throw, since the ChildOf relation will automatically
      // remove the child nodes when the parent node is destroyed first.
      expect(() => world[operation]()).not.toThrow();

      // A reset world always has one entity that is the world itself.
      if (operation === 'reset') expect(world.entities.length).toBe(1);
    }
  );

  it('can create many worlds', () => {
    const worlds = [];
    for (let i = 0; i < 200; i++) {
      worlds.push(createWorld());
    }
    expect(worlds.length).toBe(200);
  });

  it('should add, get, set and remove singletons', () => {
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

    world.set(Time, { last: 1, delta: 1 });

    expect(world.get(Time)!.last).toBe(1);
    expect(world.get(Time)!.delta).toBe(1);

    // Use callbacks to set.
    world.set(Time, (prev) => {
      return { last: prev.last + 1, delta: prev.delta + 1 };
    });

    expect(world.get(Time)!.last).toBe(2);
    expect(world.get(Time)!.delta).toBe(2);

    world.remove(Time);
    expect(world.has(Time)).toBe(false);
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
