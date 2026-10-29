import { beforeEach, describe, expect, expectTypeOf, it } from 'vitest';
import { $internal, createWorld, type Entity, getStore, Name, trait, unpackEntity } from '../src';

const Foo = trait();
const Bar = trait({ value: 0 });
const Baz = trait(() => ({ value: 0 }));

describe('Entity', () => {
  const world = createWorld();

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

  it('should recycle entities and increment generation', () => {
    const entities: Entity[] = [];

    for (let i = 0; i < 50; i++) {
      entities.push(world.spawn(Bar));
    }

    const bar = getStore(world, Bar);
    const storePageCount = bar.value.length;

    for (const entity of entities) {
      entity.destroy();
    }

    // Spawning after destroy should recycle slots with bumped generation.
    const recycled1 = world.spawn(Bar);
    const u1 = unpackEntity(recycled1);
    expect(u1.generation).toBe(
      (entities.find((entity) => entity.id() === u1.entityId)!.generation() + 1) & 255
    );

    const recycled2 = world.spawn(Bar);
    const u2 = unpackEntity(recycled2);
    expect(u2.generation).toBe(
      (entities.find((entity) => entity.id() === u2.entityId)!.generation() + 1) & 255
    );
    expect(u2.entityId).not.toBe(u1.entityId);

    const recycled3 = world.spawn(Bar);
    const u3 = unpackEntity(recycled3);
    expect(u3.generation).toBe(
      (entities.find((entity) => entity.id() === u3.entityId)!.generation() + 1) & 255
    );

    // Store pages should not grow since slots are reused within the same page.
    expect(bar.value.length).toBe(storePageCount);
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

  it('can add traits', () => {
    const entity = world.spawn();

    entity.add(Foo, Bar);

    expect(entity.has(Foo)).toBe(true);
    expect(entity.has(Bar)).toBe(true);
  });

  it('can add traits with initial state', () => {
    const entity = world.spawn(Bar({ value: 1 }));
    expect(entity.get(Bar)!.value).toBe(1);
  });

  it('can remove traits', () => {
    const entity = world.spawn(Foo, Bar);

    entity.remove(Foo);

    expect(entity.has(Foo)).toBe(false);
    expect(entity.has(Bar)).toBe(true);
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

  it('can set trait state', () => {
    const entity = world.spawn(Bar);
    entity.set(Bar, { value: 1 });
    expect(entity.get(Bar)!.value).toBe(1);
  });

  it('can set trait state with a callback', () => {
    const entity = world.spawn(Bar);
    entity.set(Bar, (prev) => ({ value: prev.value + 1 }));
    expect(entity.get(Bar)!.value).toBe(1);
  });

  describe('named entities', () => {
    it('names entities on spawn or add and looks them up', () => {
      const player = world.spawn(Name('player'), Bar);
      const boss = world.spawn(Bar);

      expect(world.lookup('player')).toBe(player);
      expect(player.name()).toBe('player');
      expect(player.get(Name)).toBe('player');
      expectTypeOf(player.get(Name)).toEqualTypeOf<string | undefined>();
      expect(player.has(Name('player'))).toBe(true);
      expect(boss.name()).toBeUndefined();
      expect(world.lookup('boss')).toBeUndefined();

      boss.add(Name('boss'));
      expect(world.lookup('boss')).toBe(boss);
    });

    it('renames an entity and makes its previous name available', () => {
      const player = world.spawn(Name('player'));
      player.set(Name, (name) => `${name}-renamed`);

      expect(player.name()).toBe('player-renamed');
      expect(world.lookup('player')).toBeUndefined();
      expect(world.lookup('player-renamed')).toBe(player);

      const replacement = world.spawn(Name('player'));
      expect(world.lookup('player')).toBe(replacement);
    });

    it('preserves existing names when a name is already taken', () => {
      const player = world.spawn(Name('player'));
      const hero = world.spawn(Name('hero'));
      const unnamed = world.spawn();

      expect(() => world.spawn(Name('player'))).toThrow(/NAME_TAKEN/);
      expect(() => unnamed.add(Name('player'))).toThrow(/NAME_TAKEN/);
      expect(() => hero.set(Name, 'player')).toThrow(/NAME_TAKEN/);

      expect(world.lookup('player')).toBe(player);
      expect(world.lookup('hero')).toBe(hero);
      expect(hero.name()).toBe('hero');
      expect(unnamed.has(Name)).toBe(false);
    });

    it('frees a name when its trait is removed or its entity is destroyed', () => {
      const player = world.spawn(Name('player'));
      player.remove(Name);
      expect(world.lookup('player')).toBeUndefined();

      const replacement = world.spawn(Name('player'));
      replacement.destroy();
      expect(world.lookup('player')).toBeUndefined();

      const next = world.spawn(Name('player'));
      expect(world.lookup('player')).toBe(next);
    });

    it('keeps names local to each world and clears them on reset', () => {
      const other = createWorld();
      const player = world.spawn(Name('player'));
      const otherPlayer = other.spawn(Name('player'));

      expect(world.lookup('player')).toBe(player);
      expect(other.lookup('player')).toBe(otherPlayer);

      world.reset();
      expect(world.lookup('player')).toBeUndefined();
      expect(other.lookup('player')).toBe(otherPlayer);

      const replacement = world.spawn(Name('player'));
      expect(world.lookup('player')).toBe(replacement);
      other.destroy();
    });
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

  it('rejects mutations after the owning world releases its pages', () => {
    const localWorld = createWorld();
    const entity = localWorld.spawn(Bar);
    for (let i = 0; i < 1024; i++) localWorld.spawn();
    localWorld.destroy();

    expect(() => entity.set(Bar, { value: 1 })).toThrow(/The entity does not exist/);
    expect(() => entity.get(Bar)).toThrow(/The entity does not exist/);
    expect(() => entity.has(Bar)).toThrow(/The entity does not exist/);
  });

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

  it('can get entity id', () => {
    const entity = world.spawn();
    expect(typeof entity.id()).toBe('number');
    expect(entity.id()).toBeGreaterThanOrEqual(0);
  });

  it('can get entity generation', () => {
    const entity = world.spawn();
    const initialGeneration = entity.generation();

    entity.destroy();
    const entity2 = world.spawn();
    expect(entity2.generation()).toBe((initialGeneration + 1) & 255);
  });

  it('can check if entity exists in world', () => {
    const entity = world.spawn();
    expect(world.has(entity)).toBe(true);

    entity.destroy();
    expect(world.has(entity)).toBe(false);

    // Should work with world entities as well
    const worldEntity = world[$internal].worldEntity;
    expect(world.has(worldEntity)).toBe(true);
  });
});
