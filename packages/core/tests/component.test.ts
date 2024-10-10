import { beforeEach, describe, expect, it } from 'vitest';
import { createWorld } from '../src';
import { define, getStores, registerComponent } from '../src/component/component';
import { $internal } from '../src/world/symbols';

class TestClass {
	constructor(public name = 'TestClass') {}
}

const Position = define({ x: 0, y: 0 });
const Test = define({
	current: 1,
	test: 'hello',
	bool: true,
	arr: () => ['a', 'b', 'c'],
	class: () => new TestClass(),
});

describe('Component', () => {
	const world = createWorld();
	world.init();

	beforeEach(() => {
		world.reset();
	});

	it('should create a component', () => {
		const Test = define({ x: 0, y: 0 });

		expect(Object.keys(Test)).toEqual(['schema']);
		expect(typeof Test === 'function').toBe(true);
	});

	it('should register a component', () => {
		const Position = define({ x: 0, y: 0 });
		registerComponent(world, Position);

		const ctx = world[$internal];
		// Has sytem components registered by default.
		expect(world.components.size).toBe(2);
		expect(ctx.componentRecords.size).toBe(2);
		expect(ctx.componentRecords.get(Position)).toBeDefined();
	});

	it('should add and remove components to an entity', () => {
		const entity = world.spawn();

		entity.add(Position);
		entity.add(Test);
		expect(entity.has(Position)).toBe(true);
		expect(entity.has(Test)).toBe(true);

		entity.remove(Position);
		expect(entity.has(Position)).toBe(false);
		expect(entity.has(Test)).toBe(true);

		// Add multiple components at once.
		entity.add(Position, Test);
		expect(entity.has(Position)).toBe(true);

		// Remove multiple components at once.
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
		const IsTag = define();
		const entity = world.spawn();

		entity.add(IsTag);
		expect(entity.has(IsTag)).toBe(true);

		const store = getStores(world, IsTag);
		expect(store).toMatchObject({});
	});

	// This tests for the component bitmask limit of 32.
	it('should correctly register more than 32 components', () => {
		const entity = world.spawn();

		new Array(1024)
			.fill(null)
			.map((_) => define())
			.forEach((c) => {
				entity.add(c);

				expect(entity.has(c)).toBe(true);
			});
	});

	it('should add components to entities after recycling', () => {
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

	it('should set component params', () => {
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
