/**
 * Internal tests for typed trait storage implementation.
 * These tests verify internal storage structures and are not part of the public API.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { createWorld, type Entity, getStore, trait, types, $internal } from '../src';
import {
    $typedStore,
    isTypedStore,
    type TypedSoAStore,
    $typedAoSStore,
    isTypedAoSStore,
    type TypedAoSStore,
} from '../src/storage';

describe('Typed SoA Storage (Internal)', () => {
    const world = createWorld();

    beforeEach(() => {
        world.reset();
    });

    it('should create TypedArray stores for typed-soa traits', () => {
        const Position = trait({ x: types.f32(0), y: types.f32(0) });
        world.spawn(Position);

        const store = getStore(world, Position) as unknown as TypedSoAStore;

        // Store should be a typed store
        expect(isTypedStore(store)).toBe(true);
        expect(store[$typedStore]).toBe(true);

        // Fields should be TypedArrays
        expect(store.x).toBeInstanceOf(Float32Array);
        expect(store.y).toBeInstanceOf(Float32Array);
    });

    it('should set default values in TypedArrays', () => {
        const Position = trait({ x: types.f32(100), y: types.f32(200) });
        const entity = world.spawn(Position);

        const pos = entity.get(Position);
        expect(pos).toEqual({ x: 100, y: 200 });
    });

    it('should set and get trait values', () => {
        const Position = trait({ x: types.f32(0), y: types.f32(0) });
        const entity = world.spawn(Position({ x: 10, y: 20 }));

        expect(entity.get(Position)).toEqual({ x: 10, y: 20 });

        entity.set(Position, { x: 30, y: 40 });
        expect(entity.get(Position)).toEqual({ x: 30, y: 40 });
    });

    it('should support different TypedArray types', () => {
        const Mixed = trait({
            f32: types.f32(1.5),
            i32: types.i32(-100),
            u8: types.u8(255),
        });
        const entity = world.spawn(Mixed);

        const store = getStore(world, Mixed);
        expect(store.f32).toBeInstanceOf(Float32Array);
        expect(store.i32).toBeInstanceOf(Int32Array);
        expect(store.u8).toBeInstanceOf(Uint8Array);

        const data = entity.get(Mixed);
        expect(data!.f32).toBeCloseTo(1.5);
        expect(data!.i32).toBe(-100);
        expect(data!.u8).toBe(255);
    });

    it('should grow store automatically when entity count exceeds capacity', () => {
        const Position = trait({ x: types.f32(0), y: types.f32(0) });

        // Initial capacity is 8, spawn more entities to trigger growth
        const entities: Entity[] = [];
        for (let i = 0; i < 20; i++) {
            entities.push(world.spawn(Position({ x: i, y: i * 2 })));
        }

        // All entities should have correct data
        for (let i = 0; i < 20; i++) {
            const pos = entities[i].get(Position);
            expect(pos).toEqual({ x: i, y: i * 2 });
        }

        // Store should have grown
        const store = getStore(world, Position) as unknown as TypedSoAStore;
        expect(store._capacity).toBeGreaterThanOrEqual(20);
    });

    it('should preserve data when store grows', () => {
        const Position = trait({ x: types.f32(0), y: types.f32(0) });

        // Create some entities
        const entity1 = world.spawn(Position({ x: 1, y: 2 }));
        const entity2 = world.spawn(Position({ x: 3, y: 4 }));

        // Force growth by spawning many more
        for (let i = 0; i < 50; i++) {
            world.spawn(Position({ x: i + 100, y: i + 200 }));
        }

        // Original entities should still have correct data
        expect(entity1.get(Position)).toEqual({ x: 1, y: 2 });
        expect(entity2.get(Position)).toEqual({ x: 3, y: 4 });
    });

    it('should work with direct store access for bulk operations', () => {
        const Position = trait({ x: types.f32(0), y: types.f32(0) });
        const Velocity = trait({ vx: types.f32(1), vy: types.f32(1) });

        const entities: Entity[] = [];
        for (let i = 0; i < 10; i++) {
            entities.push(world.spawn(Position({ x: i, y: i }), Velocity({ vx: 0.5, vy: 0.5 })));
        }

        const posStore = getStore(world, Position) as unknown as { x: Float32Array; y: Float32Array };
        const velStore = getStore(world, Velocity) as unknown as { vx: Float32Array; vy: Float32Array };

        // Bulk update using direct array access
        for (const entity of entities) {
            const eid = entity.id();
            posStore.x[eid] += velStore.vx[eid];
            posStore.y[eid] += velStore.vy[eid];
        }

        // Verify updates
        for (let i = 0; i < 10; i++) {
            const pos = entities[i].get(Position);
            expect(pos!.x).toBeCloseTo(i + 0.5);
            expect(pos!.y).toBeCloseTo(i + 0.5);
        }
    });
});

describe('Typed AoS (Interleaved) Storage (Internal)', () => {
    const world = createWorld();

    beforeEach(() => {
        world.reset();
    });

    it('should create interleaved stores for typed-aos traits', () => {
        const Position = trait(() => ({
            x: types.f32(0),
            y: types.f32(0),
            z: types.f32(0),
        }));

        expect(Position[$internal].type).toBe('typed-aos');

        world.spawn(Position);
        const store = getStore(world, Position) as unknown as TypedAoSStore;

        // Store should be a typed AoS store
        expect(isTypedAoSStore(store)).toBe(true);
        expect(store[$typedAoSStore]).toBe(true);

        // Store should have interleaved buffer properties
        expect(store._buffer).toBeInstanceOf(ArrayBuffer);
        expect(store._stride).toBeGreaterThan(0);
        expect(store._capacity).toBeGreaterThan(0);
    });

    it('should calculate correct stride without alignment', () => {
        // 3 x f32 = 12 bytes, default alignment = 4, so stride = 12
        const Position = trait(() => ({
            x: types.f32(0),
            y: types.f32(0),
            z: types.f32(0),
        }));

        world.spawn(Position);
        const store = getStore(world, Position) as unknown as TypedAoSStore;

        expect(store._stride).toBe(12);
    });

    it('should calculate correct stride with alignment', () => {
        // 3 x f32 = 12 bytes, alignment = 16, so stride = 16
        const Position = trait(
            () => ({
                x: types.f32(0),
                y: types.f32(0),
                z: types.f32(0),
            }),
            { alignment: 16 }
        );

        world.spawn(Position);
        const store = getStore(world, Position) as unknown as TypedAoSStore;

        expect(store._stride).toBe(16);
    });

    it('should set default values in interleaved buffer', () => {
        const Position = trait(() => ({
            x: types.f32(100),
            y: types.f32(200),
            z: types.f32(300),
        }));

        const entity = world.spawn(Position);
        const pos = entity.get(Position);

        expect(pos).toEqual({ x: 100, y: 200, z: 300 });
    });

    it('should set and get trait values', () => {
        const Position = trait(() => ({
            x: types.f32(0),
            y: types.f32(0),
            z: types.f32(0),
        }));

        const entity = world.spawn(Position({ x: 10, y: 20, z: 30 }));
        expect(entity.get(Position)).toEqual({ x: 10, y: 20, z: 30 });

        entity.set(Position, { x: 40, y: 50, z: 60 });
        expect(entity.get(Position)).toEqual({ x: 40, y: 50, z: 60 });
    });

    it('should support different TypedArray types in interleaved storage', () => {
        const Mixed = trait(() => ({
            f32: types.f32(1.5),
            i32: types.i32(-100),
            u8: types.u8(255),
        }));

        const entity = world.spawn(Mixed);
        const data = entity.get(Mixed);

        expect(data!.f32).toBeCloseTo(1.5);
        expect(data!.i32).toBe(-100);
        expect(data!.u8).toBe(255);
    });

    it('should grow store automatically when entity count exceeds capacity', () => {
        const Position = trait(() => ({
            x: types.f32(0),
            y: types.f32(0),
            z: types.f32(0),
        }));

        // Initial capacity is 8, spawn more entities to trigger growth
        const entities: Entity[] = [];
        for (let i = 0; i < 20; i++) {
            entities.push(world.spawn(Position({ x: i, y: i * 2, z: i * 3 })));
        }

        // All entities should have correct data
        for (let i = 0; i < 20; i++) {
            const pos = entities[i].get(Position);
            expect(pos).toEqual({ x: i, y: i * 2, z: i * 3 });
        }

        // Store should have grown
        const store = getStore(world, Position) as unknown as TypedAoSStore;
        expect(store._capacity).toBeGreaterThanOrEqual(20);
    });

    it('should preserve data when store grows', () => {
        const Position = trait(() => ({
            x: types.f32(0),
            y: types.f32(0),
            z: types.f32(0),
        }));

        // Create some entities
        const entity1 = world.spawn(Position({ x: 1, y: 2, z: 3 }));
        const entity2 = world.spawn(Position({ x: 4, y: 5, z: 6 }));

        // Force growth by spawning many more
        for (let i = 0; i < 50; i++) {
            world.spawn(Position({ x: i + 100, y: i + 200, z: i + 300 }));
        }

        // Original entities should still have correct data
        expect(entity1.get(Position)).toEqual({ x: 1, y: 2, z: 3 });
        expect(entity2.get(Position)).toEqual({ x: 4, y: 5, z: 6 });
    });

    it('should have interleaved memory layout', () => {
        const Position = trait(() => ({
            x: types.f32(0),
            y: types.f32(0),
        }));

        const entity1 = world.spawn(Position({ x: 1, y: 2 }));
        const entity2 = world.spawn(Position({ x: 3, y: 4 }));

        const store = getStore(world, Position) as unknown as TypedAoSStore;
        const view = new Float32Array(store._buffer);

        // Memory layout should be interleaved: [x0, y0, ..., x1, y1, ...]
        // Entity IDs start after the world entity, so check relative positions
        const eid1 = entity1.id();
        const eid2 = entity2.id();
        const stride = store._stride / 4; // stride in float32 elements

        expect(view[eid1 * stride + 0]).toBe(1); // x of entity1
        expect(view[eid1 * stride + 1]).toBe(2); // y of entity1
        expect(view[eid2 * stride + 0]).toBe(3); // x of entity2
        expect(view[eid2 * stride + 1]).toBe(4); // y of entity2
    });

    it('should work with strided proxy views for direct access', () => {
        const Position = trait(() => ({
            x: types.f32(0),
            y: types.f32(0),
        }));

        const entity = world.spawn(Position({ x: 10, y: 20 }));
        const store = getStore(world, Position) as unknown as TypedAoSStore;
        const eid = entity.id();

        // Direct access through strided proxy views
        expect((store.x as any)[eid]).toBe(10);
        expect((store.y as any)[eid]).toBe(20);

        // Modify through strided proxy views
        (store.x as any)[eid] = 30;
        (store.y as any)[eid] = 40;

        expect(entity.get(Position)).toEqual({ x: 30, y: 40 });
    });
});
