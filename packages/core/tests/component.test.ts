import { beforeEach, describe, expect, it } from 'vitest';
import { World } from '../world/world';
import { define, registerComponent } from '../component/component';
import { $bitflag, $componentRecords } from '../world/symbols';

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
	const world = new World();
	world.init();

	beforeEach(() => {
		world.reset();
	});

	it('should create a component', () => {
		const Test = define({ x: 0, y: 0 });

		expect(Object.keys(Test)).toEqual(['schema', 'with']);
	});

	it('should register a component', () => {
		const Position = define({ x: 0, y: 0 });
		registerComponent(world, Position);

		expect(world.components.size).toBe(1);
		expect(world[$componentRecords].size).toBe(1);
		expect(world[$componentRecords].get(Position)).toBeDefined();
		expect(world[$bitflag]).toBe(2);
	});

	it('should add and remove components to an entity', () => {
		const entity = world.create();

		world.add(entity, Position);
		world.add(entity, Test);
		expect(world.has(entity, Position)).toBe(true);
		expect(world.has(entity, Test)).toBe(true);

		world.remove(entity, Position);
		expect(world.has(entity, Position)).toBe(false);
		expect(world.has(entity, Test)).toBe(true);

		// Add multiple components at once.
		world.add(entity, Position, Test);
		expect(world.has(entity, Position)).toBe(true);

		// Remove multiple components at once.
		world.remove(entity, Position, Test);
		expect(world.has(entity, Position)).toBe(false);
	});

	it('should create SoA stores when registered by adding', () => {
		const entity = world.create();

		world.add(entity, Position);
		const store = world.get(Position);

		expect(store).toMatchObject({ x: [0], y: [0] });
	});

	it('should get multiple stores at once', () => {
		const entity = world.create();

		world.add(entity, Position, Test);
		const [position, test] = world.get(Position, Test);

		position.x[0] = 1;
		test.current[0] = 2;

		expect(position).toMatchObject({ x: [1], y: [0] });
		expect(test).toMatchObject({
			current: [2],
			test: ['hello'],
			bool: [true],
			arr: [['a', 'b', 'c']],
			class: [new TestClass()],
		});
	});

	it('should set defaults based on the schema', () => {
		const entity = world.create();

		world.add(entity, Test);
		const store = world.get(Test);

		expect(store).toMatchObject({
			current: [1],
			test: ['hello'],
			bool: [true],
			arr: [['a', 'b', 'c']],
		});
	});

	it('should override defaults with params', () => {
		const entity = world.create();

		// Partial
		world.add(entity, Test.with({ current: 2, arr: ['d', 'e', 'f'] }));
		const store = world.get(Test);

		expect(store).toMatchObject({
			current: [2],
			test: ['hello'],
			bool: [true],
			arr: [['d', 'e', 'f']],
			class: [new TestClass()],
		});

		// Reset
		world.remove(entity, Test);

		// Full
		world.add(
			entity,
			Test.with({
				current: 3,
				test: 'world',
				bool: false,
				arr: ['g', 'h', 'i'],
				class: new TestClass('Me'),
			})
		);

		expect(store).toMatchObject({
			current: [3],
			test: ['world'],
			bool: [false],
			arr: [['g', 'h', 'i']],
			class: [new TestClass('Me')],
		});
	});

	it('should create tags with empty stores', () => {
		const IsTag = define();
		const entity = world.create();

		world.add(entity, IsTag);
		expect(world.has(entity, IsTag)).toBe(true);

		const store = world.get(IsTag);
		expect(store).toMatchObject({});
	});

	// This tests for the component bitmask limit of 32.
	it('should correctly register more than 32 components', () => {
		const entity = world.create();

		new Array(1024)
			.fill(null)
			.map((_) => define())
			.forEach((c) => {
				world.add(entity, c);

				expect(world.has(entity, c)).toBe(true);
			});
	});

	it('should add components to entities after recycling', () => {
		let entity = 0;

		for (let i = 0; i < 10; i++) {
			entity = world.create();
		}

		for (let i = 0; i < 10; i++) {
			world.destroy(i);
		}

		world.recycle();

		for (let i = 0; i < 10; i++) {
			entity = world.create();
		}

		world.add(entity, Position);

		expect(world.has(entity, Position)).toBe(true);
	});
});
