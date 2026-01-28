import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createWorld, type Entity, getStore, trait, types, $internal } from '../src';

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

describe('Typed Trait Detection', () => {
    it('should detect typed-soa when schema has all typed fields', () => {
        const TypedPosition = trait({ x: types.f32(0), y: types.f32(0) });

        expect(TypedPosition[$internal].type).toBe('typed-soa');
        expect(TypedPosition[$internal].template).toBeNull();
    });

    it('should detect soa when schema has regular fields', () => {
        const Position = trait({ x: 0, y: 0 });

        expect(Position[$internal].type).toBe('soa');
        expect(Position[$internal].template).toBeNull();
    });

    it('should detect typed-aos when factory returns object with all typed fields', () => {
        const TypedPosition = trait(() => ({
            x: types.f32(0),
            y: types.f32(0),
            z: types.f32(0),
        }));

        expect(TypedPosition[$internal].type).toBe('typed-aos');
        expect(TypedPosition[$internal].template).not.toBeNull();
        expect(TypedPosition[$internal].template).toHaveProperty('x');
        expect(TypedPosition[$internal].template).toHaveProperty('y');
        expect(TypedPosition[$internal].template).toHaveProperty('z');
    });

    it('should detect aos when factory returns regular object', () => {
        const Position = trait(() => ({ x: 0, y: 0 }));

        expect(Position[$internal].type).toBe('aos');
        expect(Position[$internal].template).not.toBeNull();
    });

    it('should detect tag when schema is empty', () => {
        const IsTag = trait();
        const IsTagEmpty = trait({});

        expect(IsTag[$internal].type).toBe('tag');
        expect(IsTagEmpty[$internal].type).toBe('tag');
        expect(IsTag[$internal].template).toBeNull();
    });

    it('should reject mixed typed/untyped schemas', () => {
        // Mixed schema should be detected as soa (not typed-soa)
        // because isTypedSchema requires ALL fields to be typed
        const MixedPosition = trait({ x: types.f32(0), y: 0 });

        expect(MixedPosition[$internal].type).toBe('soa');
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
