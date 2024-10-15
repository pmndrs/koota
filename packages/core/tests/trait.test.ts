import { beforeEach, describe, expect, it } from 'vitest';
import { createWorld } from '../src';
import { trait, getStores, registerTrait } from '../src/trait/trait';
import { $internal } from '../src/common';

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

	it('should register a trait', () => {
		const Position = trait({ x: 0, y: 0 });
		registerTrait(world, Position);

		const ctx = world[$internal];
		// Has sytem traits registered by default.
		expect(world.traits.size).toBe(2);
		expect(ctx.traitData.size).toBe(2);
		expect(ctx.traitData.get(Position)).toBeDefined();
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
		const store = getStores(world, Position);

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

		const store = getStores(world, IsTag);
		expect(store).toMatchObject({});
	});

	// This tests for the trait bitmask limit of 32.
	it('should correctly register more than 32 traits', () => {
		const entity = world.spawn();

		new Array(1024)
			.fill(null)
			.map((_) => trait())
			.forEach((c) => {
				entity.add(c);

				expect(entity.has(c)).toBe(true);
			});
	});

	it('should add traits to entities after recycling', () => {
		let entity = world.spawn();

		for (let i = 0; i < 10; i++) {
			entity = world.spawn();
		}

		for (let i = 0; i < 10; i++) {
			entity.destroy();
		}

		for (let i = 0; i < 10; i++) {
			entity = world.spawn();
		}

		entity.add(Position);
		expect(entity.has(Position)).toBe(true);
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
});
