import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createWorld, type Entity, getStore, trait } from '../src';

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
});

describe('Trait', () => {
	const world = createWorld();

	beforeEach(() => {
		world.reset();
	});

	it('should create a trait', () => {
		const Test = trait({ x: 0, y: 0 });

		expect(Object.keys(Test)).toEqual(['schema']);
		expect(typeof Test === 'function').toBe(true);
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

		// Remove multiple traits at once.
		entity.remove(Position, Test);
		expect(entity.has(Position)).toBe(false);
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
});
