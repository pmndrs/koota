import { beforeEach, describe, expect, expectTypeOf, it } from 'vitest';
import { $internal, createWorld, trait, unpackEntity } from '../../src';

const Foo = trait();
const Bar = trait({ value: 0 });
const Baz = trait(() => ({ value: 0 }));

describe('Entity', () => {
  // Disable destroyed-entity retention so ids can be reused on the next spawn.
  const world = createWorld({ retain: 0 });

  beforeEach(() => {
    world.reset();
  });

  it('should create and destroy an entity', () => {
    const entityA = world.spawn();
    expect(entityA.id()).toBe(world.entities[0].id() + 1);

    const entityB = world.spawn();
    expect(entityB.id()).toBe(entityA.id() + 1);

    const entityC = world.spawn();
    expect(entityC.id()).toBe(entityB.id() + 1);

    entityA.destroy();
    entityC.destroy();
    entityB.destroy();

    expect(world.entities.length).toBe(1);
  });

  it('removes every trait on destroy across mask generations', () => {
    const traits = Array.from({ length: 40 }, () => trait());
    const removed = new Set<number>();
    traits.forEach((t, i) => world.onRemove(t, () => removed.add(i)));

    const entity = world.spawn(...traits);
    entity.destroy();

    expect(removed.size).toBe(traits.length);
    const recycled = world.spawn();
    for (const t of traits) expect(recycled.has(t)).toBe(false);
  });

  it('should encode generation and entity ID', () => {
    const entity = world.spawn();
    const { generation, entityId } = unpackEntity(entity);

    expect(generation).toBe(entity >>> 24);
    expect(entityId).toBeGreaterThanOrEqual(0);

    const world2 = createWorld();
    const entity2 = world2.spawn();
    const { generation: generation2, entityId: entityId2 } = unpackEntity(entity2);

    expect(generation2).toBe(entity2 >>> 24);
    // Different worlds get different entity IDs from the global allocator.
    expect(entityId2).not.toBe(entityId);
  });

  it('should add entities with spawn', () => {
    const entity = world.spawn(Foo, Bar);

    expect(entity.has(Foo)).toBe(true);
    expect(entity.has(Bar)).toBe(true);
  });

  it('should return undefined for missing traits', () => {
    const entity = world.spawn();

    expect(entity.has(Bar)).toBe(false);
    expect(entity.get(Bar)).toEqual(undefined);
    expectTypeOf(entity.get(Bar)).toEqualTypeOf<{ value: number } | undefined>();

    expect(entity.has(Baz)).toBe(false);
    expect(entity.get(Baz)).toBeUndefined();
    expectTypeOf(entity.get(Baz)).toEqualTypeOf<{ value: number } | undefined>();
  });

  it('can get trait state', () => {
    let entity = world.spawn(Bar({ value: 1 }));
    const bar = entity.get(Bar)!;
    expect(bar.value).toBe(1);

    // Changing trait state should not affect the entity.
    bar.value = 2;
    expect(entity.get(Bar)!.value).toBe(1);

    // Check this works with multi-generational entities.
    entity.destroy();

    entity = world.spawn(Bar({ value: 1 }));
    expect(entity.get(Bar)!.value).toBe(1);
  });

  it('can set trait state with a callback', () => {
    const entity = world.spawn(Bar);
    entity.set(Bar, (prev) => ({ value: prev.value + 1 }));
    expect(entity.get(Bar)!.value).toBe(1);
  });

  it('can upsert traits', () => {
    const Position = trait({ x: 0, y: 0 });
    const entity = world.spawn(Position({ x: 1, y: 2 }));

    // Sets the given fields of a trait the entity has.
    entity.upsert(Position, { x: 5 });
    expect(entity.get(Position)).toEqual({ x: 5, y: 2 });

    // Adds a trait the entity lacks with the value.
    entity.upsert(Bar, { value: 3 });
    expect(entity.get(Bar)).toEqual({ value: 3 });
  });

  it('emits add only when upsert adds the trait and change on every write', () => {
    const entity = world.spawn();
    let added = 0;
    let changed = 0;
    entity.onAdd(Bar, () => added++);
    entity.onChange(Bar, () => changed++);

    entity.upsert(Bar, { value: 1 });
    expect(added).toBe(1);
    expect(changed).toBe(1);

    entity.upsert(Bar, { value: 2 });
    expect(added).toBe(1);
    expect(changed).toBe(2);
  });

  it.each(['set', 'add', 'remove', 'changed', 'destroy'] as const)(
    'rejects %s on a recycled entity handle before affecting its replacement',
    (operation) => {
      const stale = world.spawn(Bar);
      stale.destroy();
      const replacement = world.spawn(Bar({ value: 5 }));
      expect(replacement.id()).toBe(stale.id());
      let notifications = 0;
      replacement.onChange(Bar, () => notifications++);

      expect(() => {
        if (operation === 'set') stale.set(Bar, { value: 10 });
        else if (operation === 'add') stale.add(Foo);
        else if (operation === 'remove') stale.remove(Bar);
        else if (operation === 'changed') stale.changed(Bar);
        else stale.destroy();
      }).toThrow(/The entity does not exist/);

      expect(replacement.isAlive()).toBe(true);
      expect(replacement.get(Bar)).toEqual({ value: 5 });
      expect(replacement.has(Foo)).toBe(false);
      expect(notifications).toBe(0);
    }
  );

  it('can check if an entity is alive', () => {
    let entity = world.spawn();
    expect(entity.isAlive()).toBe(true);
    const initialGeneration = entity.generation();
    const eid = entity.id();

    entity.destroy();
    expect(entity.isAlive()).toBe(false);

    // Should be resilient to changes in generation with the same entity ID.
    entity = world.spawn(Bar);
    expect(entity.isAlive()).toBe(true);
    expect(entity.id()).toBe(eid);
    expect(entity.generation()).toBe((initialGeneration + 1) & 255);

    entity.destroy();
    expect(entity.isAlive()).toBe(false);
  });

  it('can check if entity exists in world', () => {
    const entity = world.spawn();
    expect(world.has(entity)).toBe(true);

    entity.destroy();
    expect(world.has(entity)).toBe(false);

    // Should work with world entities as well
    const worldEntity = world[$internal].worldEntity!;
    expect(world.has(worldEntity)).toBe(true);
  });
});
