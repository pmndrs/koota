import { beforeEach, describe, expect, it } from 'vitest';
import { createWorld, relation, type TraitInstance, trait, universe } from '../src';

describe('World', () => {
	beforeEach(() => {
		universe.reset();
	});

	it('should create a world', () => {
		// World inits on creation.
		const world = createWorld();

		expect(world.isInitialized).toBe(true);
		expect(world.id).toBe(0);
		expect(universe.worlds[0]!).toBe(world);
		expect(universe.worldIndex.worldCursor).toBe(1);
	});

	it('should optionaly init lazily', () => {
		const world = createWorld({ lazy: true });
		expect(world.isInitialized).toBe(false);
		world.init();
		expect(world.isInitialized).toBe(true);
	});

	it('should reset the world', () => {
		const world = createWorld();
		world.reset();

		// Always has one entity that is the world itself.
		expect(world.entities.length).toBe(1);
	});

	it('reset should remove entities with auto-remove relations', () => {
		const Node = trait();
		const ChildOf = relation({ autoRemoveTarget: true, exclusive: true });

		const world = createWorld();

		// Create a parent node and a child node.
		const parentNode = world.spawn(Node);
		world.spawn(Node, ChildOf(parentNode));

		// Expect this to not throw, since the ChildOf relation will automatically
		// remove the child node when the parent node is destroyed first.
		expect(() => world.reset()).not.toThrow();

		// Always has one entity that is the world itself.
		expect(world.entities.length).toBe(1);
	});

	it('destroy should lead to entities with auto-remove relations being removed as well', () => {
		const Node = trait();
		const ChildOf = relation({ autoRemoveTarget: true, exclusive: true });

		const world = createWorld();

		// Create a parent node and two child nodes
		const parentNode = world.spawn(Node);
		world.spawn(Node, ChildOf(parentNode));
		world.spawn(Node, ChildOf(parentNode));

		// Expect this to not throw, since the ChildOf relation will automatically
		// remove the child node when the parent node is destroyed first
		expect(() => world.destroy()).not.toThrow();
	});

	it('errors if more than 16 worlds are created', () => {
		for (let i = 0; i < 16; i++) {
			createWorld();
		}

		expect(() => createWorld()).toThrow();
	});

	it('should recycle world IDs when destroyed', () => {
		const world = createWorld();
		const id = world.id;

		world.destroy();

		const newWorld = createWorld();
		expect(newWorld.id).toBe(id);
	});

	it('should add, remove and get singletons', () => {
		const Test = trait({ last: 0, delta: 0 });

		const world = createWorld(Test);
		expect(world.has(Test)).toBe(true);

		const { last: then, delta } = world.get(Test)!;
		expect(then).toBe(0);
		expect(delta).toBe(0);

		const Time = trait({ last: 0, delta: 0 });

		world.add(Time);
		expect(world.has(Time)).toBe(true);
		expect(world.has(Test)).toBe(true);

		// Does not show up in a query.
		const query = world.query(Time);
		expect(query.length).toBe(0);

		const time = world.get(Time)!;
		time.last = 1;
		time.delta = 1;
		world.set(Time, time);

		expect(time.last).toBe(1);
		expect(time.delta).toBe(1);

		world.remove(Time);
		expect(world.has(Time)).toBe(false);
	});

	it('should set singletons', () => {
		const Test = trait({ last: 0, delta: 0 });
		const world = createWorld(Test);

		world.set(Test, { last: 1, delta: 1 });

		expect(world.get(Test)!.last).toBe(1);
		expect(world.get(Test)!.delta).toBe(1);

		// Use callbacks to set.
		world.set(Test, (prev) => {
			return { last: prev.last + 1, delta: prev.delta + 1 };
		});

		expect(world.get(Test)!.last).toBe(2);
		expect(world.get(Test)!.delta).toBe(2);
	});

	it('should observe traits', () => {
		const TimeOfDay = trait({ hour: 0 });
		const world = createWorld(TimeOfDay);

		let timeOfDay: TraitInstance<typeof TimeOfDay> | undefined;
		world.onChange(TimeOfDay, (e) => {
			timeOfDay = e.get(TimeOfDay);
		});

		world.set(TimeOfDay, { hour: 1 });
		expect(timeOfDay).toEqual({ hour: 1 });
	});
});
