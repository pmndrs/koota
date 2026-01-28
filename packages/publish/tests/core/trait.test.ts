import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createWorld, type Entity, getStore, trait, types, $internal } from '../../dist';

class TestClass {
    constructor(public name = 'TestClass') {}
}

const Position = trait({ x: 0, y: 0 });

const Test = trait({
    current: 1,
    test: 'hello',
    bool: true,
    arr: () => ['a', 'b', 'c'],
    class: () => new TestClass(),
    bigInt: 1n,
});

const Tag = trait();

describe('Trait', () => {
    const world = createWorld();

    beforeEach(() => {
        world.reset();
    });

    it('should create a trait', () => {
        const Test = trait({ x: 0, y: 0 });

        expect(Object.keys(Test)).toContain('schema');
        expect(typeof Test === 'function').toBe(true);
    });

    it('should throw an error if the schema contains an object or array', () => {
        // @ts-expect-error - nested objects are not valid schema values
        expect(() => trait({ object: { a: 1, b: 2 } })).toThrow();
        // @ts-expect-error - arrays are not valid schema values
        expect(() => trait({ array: [1, 2, 3] })).toThrow();
    });

    it('should add and remove traits to an entity', () => {
        const entity = world.spawn();

        entity.add(Position);
        entity.add(Test);
        expect(entity.has(Position)).toBe(true);
        expect(entity.has(Test)).toBe(true);

        entity.remove(Position);
        expect(entity.has(Position)).toBe(false);
        expect(entity.has(Test)).toBe(true);

        // Add multiple traits at once.
        entity.add(Position, Test);
        expect(entity.has(Position)).toBe(true);
        expect(entity.has(Test)).toBe(true);

        // Remove multiple traits at once.
        entity.remove(Position, Test);
        expect(entity.has(Position)).toBe(false);
        expect(entity.has(Test)).toBe(false);

        // Can still remove multiple traits when one is missing.
        entity.add(Position, Test);
        entity.remove(Tag, Position, Test);

        expect(entity.has(Position)).toBe(false);
        expect(entity.has(Test)).toBe(false);
        expect(entity.has(Tag)).toBe(false);
    });

    it('should create SoA stores when registered by adding', () => {
        const entity = world.spawn();

        entity.add(Position);
        const store = getStore(world, Position);

        // First entry is the world entity.
        expect(store).toMatchObject({ x: [undefined, 0], y: [undefined, 0] });
    });

    it('should set defaults based on the schema', () => {
        const entity = world.spawn();

        entity.add(Test);
        const test = entity.get(Test);

        expect(test).toMatchObject({
            current: 1,
            test: 'hello',
            bool: true,
            arr: ['a', 'b', 'c'],
        });
    });

    it('should override defaults with params', () => {
        const entity = world.spawn();

        // Partial
        entity.add(Test({ current: 2, arr: ['d', 'e', 'f'] }));
        let test = entity.get(Test);

        expect(test).toMatchObject({
            current: 2,
            test: 'hello',
            bool: true,
            arr: ['d', 'e', 'f'],
            class: new TestClass(),
        });

        // Reset
        entity.remove(Test);

        // Full
        entity.add(
            Test({
                current: 3,
                test: 'world',
                bool: false,
                arr: ['g', 'h', 'i'],
                class: new TestClass('Me'),
            })
        );

        test = entity.get(Test);
        expect(test).toMatchObject({
            current: 3,
            test: 'world',
            bool: false,
            arr: ['g', 'h', 'i'],
            class: new TestClass('Me'),
        });
    });

    it('should create tags with empty stores', () => {
        const IsTag = trait();
        const entity = world.spawn();

        entity.add(IsTag);
        expect(entity.has(IsTag)).toBe(true);

        const store = getStore(world, IsTag);
        expect(store).toMatchObject({});
    });

    // This tests for the trait bitmask limit of 32.
    it('should correctly register more than 32 traits', () => {
        const entity = world.spawn();

        Array.from({ length: 1024 }, () => trait()).forEach(() => {
            entity.add();
        });
    });

    it('should add traits to entities after recycling', () => {
        const entities: Entity[] = [];

        for (let i = 0; i < 10; i++) {
            entities.push(world.spawn());
        }

        for (let i = 0; i < 10; i++) {
            entities.pop()?.destroy();
        }

        for (let i = 0; i < 10; i++) {
            entities.push(world.spawn());
        }

        entities[0].add(Position);
        expect(entities[0].has(Position)).toBe(true);
    });

    it('should set trait params', () => {
        const entity = world.spawn(Test);
        entity.set(Test, { current: 2, test: 'world' });

        const test = entity.get(Test);
        expect(test).toMatchObject({
            current: 2,
            test: 'world',
            bool: true,
            arr: ['a', 'b', 'c'],
        });
    });

    it('trait props with callbacks should be called on each add', () => {
        const mock = vi.fn(() => new TestClass());
        const Test = trait({ value: mock });

        const entityA = world.spawn(Test);

        expect(mock).toHaveBeenCalledTimes(1);
        expect(entityA.get(Test)!.value).toBeInstanceOf(TestClass);

        const entityB = world.spawn(Test);
        expect(mock).toHaveBeenCalledTimes(2);
        expect(entityB.get(Test)!.value).toBeInstanceOf(TestClass);
    });

    it('can create atomic traits', () => {
        const object = { a: 1, b: 2 };
        const AtomicObject = trait(() => object);
        let entity = world.spawn(AtomicObject);

        // The object is returned by reference.
        expect(object).toBe(entity.get(AtomicObject));
        expect(entity.get(AtomicObject)!.a).toBe(1);

        entity.set(AtomicObject, { a: 2, b: 3 });

        // A new object is set making the reference different.
        expect(object).not.toBe(entity.get(AtomicObject));
        expect(entity.get(AtomicObject)!.a).toBe(2);

        // Can pass in a custom object into the trait.
        entity = world.spawn(AtomicObject({ a: 3, b: 4 }));
        expect(entity.get(AtomicObject)!.a).toBe(3);
        // Works with arrays too.
        const AtomicArray = trait(() => [1, 2, 3]);
        entity = world.spawn(AtomicArray);
        expect(entity.get(AtomicArray)).toEqual([1, 2, 3]);

        entity.set(AtomicArray, [4, 5, 6]);
        expect(entity.get(AtomicArray)).toEqual([4, 5, 6]);
    });

    it('can be subscribed for for add and remove events', () => {
        // The trait should have its data set before the onAdd callback is called.
        const addCb = vi.fn((entity: Entity) => {
            expect(entity.get(Position)).toMatchObject({ x: 1, y: 2 });
        });

        // The trait should still be present after the onRemove callback is called.
        const removeCb = vi.fn((entity: Entity) => {
            expect(entity.has(Position)).toBe(true);
        });

        const entity = world.spawn();

        world.onAdd(Position, addCb);
        world.onRemove(Position, removeCb);

        entity.add(Position({ x: 1, y: 2 }));
        expect(addCb).toHaveBeenCalledTimes(1);

        entity.remove(Position);
        expect(removeCb).toHaveBeenCalledTimes(1);
    });

    it('should return undefined for tag traits', () => {
        const IsTag = trait();
        const entity = world.spawn();

        entity.add(IsTag);
        expect(entity.has(IsTag)).toBe(true);

        // Getting a tag trait should not throw
        expect(entity.get(IsTag)).toBeUndefined();
    });
});

describe('Buffer Trait Detection', () => {
    it('should detect buffer when schema has all typed fields', () => {
        const Position = trait({ x: types.f32(0), y: types.f32(0) });

        expect(Position[$internal].type).toBe('buffer');
    });

    it('should detect soa when schema has regular fields', () => {
        const Position = trait({ x: 0, y: 0 });

        expect(Position[$internal].type).toBe('soa');
    });

    it('should detect aos when factory returns object with typed fields', () => {
        // Factory functions are always AoS, even with typed fields
        const Position = trait(() => ({
            x: types.f32(0),
            y: types.f32(0),
            z: types.f32(0),
        }));

        expect(Position[$internal].type).toBe('aos');
    });

    it('should detect aos when factory returns regular object', () => {
        const Position = trait(() => ({ x: 0, y: 0 }));

        expect(Position[$internal].type).toBe('aos');
    });

    it('should detect tag when schema is empty', () => {
        const IsTag = trait();
        const IsTagEmpty = trait({});

        expect(IsTag[$internal].type).toBe('tag');
        expect(IsTagEmpty[$internal].type).toBe('tag');
    });

    it('should reject mixed typed/untyped schemas', () => {
        // Mixed schemas are not allowed - must be all typed or all regular
        // TypeScript catches this at compile time (hence @ts-expect-error)
        // Runtime also validates and throws
        expect(() =>
            // @ts-expect-error - Mixed schemas rejected at compile time
            trait({ x: types.f32(0), y: 0 })
        ).toThrow('Koota: Mixed typed and untyped fields are not allowed');
    });

    it('should allow typed fields in schema validation', () => {
        // This should not throw (TypedField objects are allowed)
        expect(() => trait({ x: types.f32(0), y: types.i32(0) })).not.toThrow();
    });

    it('should still reject regular objects in schema', () => {
        // @ts-expect-error - nested objects are not valid schema values
        expect(() => trait({ obj: { a: 1, b: 2 } })).toThrow();
    });
});

describe('Buffer Storage', () => {
    const world = createWorld();

    beforeEach(() => {
        world.reset();
    });

    it('should create TypedArray stores for buffer traits', () => {
        const Position = trait({ x: types.f32(0), y: types.f32(0) });
        world.spawn(Position);

        const store = getStore(world, Position);

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

    it('should grow store automatically when entity count exceeds initial capacity', () => {
        const Position = trait({ x: types.f32(0), y: types.f32(0) });

        // Spawn more entities than initial capacity (8) to trigger growth
        const entities: Entity[] = [];
        for (let i = 0; i < 20; i++) {
            entities.push(world.spawn(Position({ x: i, y: i * 2 })));
        }

        // All entities should have correct data after growth
        for (let i = 0; i < 20; i++) {
            const pos = entities[i].get(Position);
            expect(pos).toEqual({ x: i, y: i * 2 });
        }
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

        const posStore = getStore(world, Position);
        const velStore = getStore(world, Velocity);

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

describe('Type Helpers', () => {
    const world = createWorld();

    beforeEach(() => {
        world.reset();
    });

    it('should create correct TypedArray for each number type helper', () => {
        const NumberTypes = trait({
            f32: types.f32(0),
            f64: types.f64(0),
            i8: types.i8(0),
            i16: types.i16(0),
            i32: types.i32(0),
            u8: types.u8(0),
            u8c: types.u8c(0),
            u16: types.u16(0),
            u32: types.u32(0),
        });
        world.spawn(NumberTypes);

        const store = getStore(world, NumberTypes);
        expect(store.f32).toBeInstanceOf(Float32Array);
        expect(store.f64).toBeInstanceOf(Float64Array);
        expect(store.i8).toBeInstanceOf(Int8Array);
        expect(store.i16).toBeInstanceOf(Int16Array);
        expect(store.i32).toBeInstanceOf(Int32Array);
        expect(store.u8).toBeInstanceOf(Uint8Array);
        expect(store.u8c).toBeInstanceOf(Uint8ClampedArray);
        expect(store.u16).toBeInstanceOf(Uint16Array);
        expect(store.u32).toBeInstanceOf(Uint32Array);
    });

    it('should create correct TypedArray for each bigint type helper', () => {
        const BigIntTypes = trait({
            i64: types.i64(0n),
            u64: types.u64(0n),
        });
        world.spawn(BigIntTypes);

        const store = getStore(world, BigIntTypes);
        expect(store.i64).toBeInstanceOf(BigInt64Array);
        expect(store.u64).toBeInstanceOf(BigUint64Array);
    });

    it('should use correct default values for number types', () => {
        const Defaults = trait({
            f32: types.f32(42),
            f64: types.f64(3.14),
            i8: types.i8(-128),
            i16: types.i16(-32768),
            i32: types.i32(-2147483648),
            u8: types.u8(255),
            u8c: types.u8c(200),
            u16: types.u16(65535),
            u32: types.u32(4294967295),
        });
        const entity = world.spawn(Defaults);
        const data = entity.get(Defaults)!;

        expect(data.f32).toBe(42);
        expect(data.f64).toBe(3.14);
        expect(data.i8).toBe(-128);
        expect(data.i16).toBe(-32768);
        expect(data.i32).toBe(-2147483648);
        expect(data.u8).toBe(255);
        expect(data.u8c).toBe(200);
        expect(data.u16).toBe(65535);
        expect(data.u32).toBe(4294967295);
    });

    it('should use correct default values for bigint types', () => {
        const BigIntDefaults = trait({
            i64: types.i64(-9223372036854775808n),
            u64: types.u64(18446744073709551615n),
        });
        const entity = world.spawn(BigIntDefaults);
        const data = entity.get(BigIntDefaults)!;

        expect(data.i64).toBe(-9223372036854775808n);
        expect(data.u64).toBe(18446744073709551615n);
    });

    it('should default to zero when no default provided for number types', () => {
        const ZeroDefaults = trait({
            f32: types.f32(),
            f64: types.f64(),
            i8: types.i8(),
            i16: types.i16(),
            i32: types.i32(),
            u8: types.u8(),
            u8c: types.u8c(),
            u16: types.u16(),
            u32: types.u32(),
        });
        const entity = world.spawn(ZeroDefaults);
        const data = entity.get(ZeroDefaults)!;

        expect(data.f32).toBe(0);
        expect(data.f64).toBe(0);
        expect(data.i8).toBe(0);
        expect(data.i16).toBe(0);
        expect(data.i32).toBe(0);
        expect(data.u8).toBe(0);
        expect(data.u8c).toBe(0);
        expect(data.u16).toBe(0);
        expect(data.u32).toBe(0);
    });

    it('should default to zero when no default provided for bigint types', () => {
        const ZeroBigIntDefaults = trait({
            i64: types.i64(),
            u64: types.u64(),
        });
        const entity = world.spawn(ZeroBigIntDefaults);
        const data = entity.get(ZeroBigIntDefaults)!;

        expect(data.i64).toBe(0n);
        expect(data.u64).toBe(0n);
    });

    it('should clamp values for u8c (Uint8ClampedArray)', () => {
        const Clamped = trait({ value: types.u8c(128) });
        const entity = world.spawn(Clamped);

        // Set value above 255 - should clamp to 255
        entity.set(Clamped, { value: 300 });
        expect(entity.get(Clamped)!.value).toBe(255);

        // Set value below 0 - should clamp to 0
        entity.set(Clamped, { value: -50 });
        expect(entity.get(Clamped)!.value).toBe(0);

        // Normal value in range
        entity.set(Clamped, { value: 100 });
        expect(entity.get(Clamped)!.value).toBe(100);
    });
});

describe('Buffer Type Options', () => {
    const world = createWorld();

    beforeEach(() => {
        world.reset();
    });

    it('should use ArrayBuffer by default', () => {
        const Position = trait({ x: types.f32(0), y: types.f32(0) });
        world.spawn(Position);

        const store = getStore(world, Position);
        // Check that the underlying buffer is an ArrayBuffer (not SharedArrayBuffer)
        expect(store.x.buffer).toBeInstanceOf(ArrayBuffer);
        expect(store.y.buffer).toBeInstanceOf(ArrayBuffer);
    });

    it('should use SharedArrayBuffer when specified', () => {
        // Skip test if SharedArrayBuffer is not available (security context)
        if (typeof SharedArrayBuffer === 'undefined') {
            return;
        }

        const Position = trait({ x: types.f32(0), y: types.f32(0) }, { buffer: SharedArrayBuffer });
        world.spawn(Position);

        const store = getStore(world, Position);
        expect(store.x.buffer).toBeInstanceOf(SharedArrayBuffer);
        expect(store.y.buffer).toBeInstanceOf(SharedArrayBuffer);
    });

    it('should preserve buffer type when store grows', () => {
        // Skip test if SharedArrayBuffer is not available
        if (typeof SharedArrayBuffer === 'undefined') {
            return;
        }

        const Position = trait({ x: types.f32(0), y: types.f32(0) }, { buffer: SharedArrayBuffer });

        // Spawn enough entities to trigger growth (initial capacity is 8)
        const entities: Entity[] = [];
        for (let i = 0; i < 20; i++) {
            entities.push(world.spawn(Position({ x: i, y: i * 2 })));
        }

        const store = getStore(world, Position);

        // Buffer type should still be SharedArrayBuffer after growth
        expect(store.x.buffer).toBeInstanceOf(SharedArrayBuffer);
        expect(store.y.buffer).toBeInstanceOf(SharedArrayBuffer);

        // Data should be preserved
        for (let i = 0; i < 20; i++) {
            expect(entities[i].get(Position)).toEqual({ x: i, y: i * 2 });
        }
    });

    it('should allow mixing traits with different buffer types', () => {
        // Skip test if SharedArrayBuffer is not available
        if (typeof SharedArrayBuffer === 'undefined') {
            return;
        }

        const Position = trait({ x: types.f32(0), y: types.f32(0) }, { buffer: SharedArrayBuffer });
        const Velocity = trait({ vx: types.f32(0), vy: types.f32(0) }); // Uses default ArrayBuffer

        const entity = world.spawn(Position({ x: 1, y: 2 }), Velocity({ vx: 3, vy: 4 }));

        const posStore = getStore(world, Position);
        const velStore = getStore(world, Velocity);

        expect(posStore.x.buffer).toBeInstanceOf(SharedArrayBuffer);
        expect(velStore.vx.buffer).toBeInstanceOf(ArrayBuffer);

        expect(entity.get(Position)).toEqual({ x: 1, y: 2 });
        expect(entity.get(Velocity)).toEqual({ vx: 3, vy: 4 });
    });

    it('should throw if buffer is explicitly undefined', () => {
        // Simulates what happens when SharedArrayBuffer is not available:
        // trait({ x: types.f32(0) }, { buffer: SharedArrayBuffer })
        // becomes { buffer: undefined } when SAB is undefined
        expect(() =>
            trait({ x: types.f32(0) }, { buffer: undefined as unknown as SharedArrayBufferConstructor })
        ).toThrow('Koota: Invalid buffer option');
    });

    it('should throw if buffer is used with non-typed schema', () => {
        // TypeScript catches this at compile time, but runtime should also validate
        // in case someone bypasses types (e.g., using `any` or plain JS)
        expect(() =>
            // @ts-expect-error - TypeScript rejects this, testing runtime validation
            trait({ x: 0, y: 0 }, { buffer: ArrayBuffer })
        ).toThrow('Koota: buffer option can only be used with typed schemas');
    });
});
