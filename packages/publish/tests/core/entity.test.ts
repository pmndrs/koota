import { beforeEach, describe, expect, expectTypeOf, it } from 'vitest';
import { $internal, createWorld, type Entity, getStore, trait, unpackEntity } from '../../dist';

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
        expect(entityA).toBe(1);

        const entityB = world.spawn();
        expect(entityB).toBe(2);

        const entityC = world.spawn();
        expect(entityC).toBe(3);

        entityA.destroy();
        entityC.destroy();
        entityB.destroy();

        expect(world.entities.length).toBe(1);
    });

    it('should encode generation and entity ID', () => {
        const entity = world.spawn();
        const { generation, entityId } = unpackEntity(entity);

        expect(generation).toBe(0);
        expect(entityId).toBeGreaterThanOrEqual(0);

        const world2 = createWorld();
        const entity2 = world2.spawn();
        const { generation: generation2, entityId: entityId2 } = unpackEntity(entity2);

        expect(generation2).toBe(0);
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
        expect(u1.generation).toBe(1);

        const recycled2 = world.spawn(Bar);
        const u2 = unpackEntity(recycled2);
        expect(u2.generation).toBe(1);
        expect(u2.entityId).not.toBe(u1.entityId);

        const recycled3 = world.spawn(Bar);
        const u3 = unpackEntity(recycled3);
        expect(u3.generation).toBe(1);

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

    it('can check if an entity is alive', () => {
        let entity = world.spawn();
        expect(entity.isAlive()).toBe(true);
        expect(entity.generation()).toBe(0);
        const eid = entity.id();

        entity.destroy();
        expect(entity.isAlive()).toBe(false);

        // Should be resilient to changes in generation with the same entity ID.
        entity = world.spawn(Bar);
        expect(entity.isAlive()).toBe(true);
        expect(entity.id()).toBe(eid);
        expect(entity.generation()).toBe(1);

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
        expect(entity.generation()).toBe(0);

        entity.destroy();
        const entity2 = world.spawn();
        expect(entity2.generation()).toBe(1);
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
