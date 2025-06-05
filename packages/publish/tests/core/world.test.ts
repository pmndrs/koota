import { beforeEach, describe, expect, it } from 'vitest';
import { createWorld, relation, trait, type TraitInstance, universe } from '../../dist';

describe('World', () => {
	beforeEach(() => {
		universe.reset();
	});

	it('should create a world', () => {
		// World inits on creation.
		const world = createWorld();

		expect(world.isInitialized).toBe(true);
		expect(world.id).toBe(0);
		expect(universe.worlds[0]!.deref()!).toBe(world);
		expect(universe.worldIndex.worldCursor).toBe(1);
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
		const Test = trait({ then: 0, delta: 0 });

		const world = createWorld(Test);
		expect(world.has(Test)).toBe(true);

		const { then, delta } = world.get(Test)!;
		expect(then).toBe(0);
		expect(delta).toBe(0);

		const Time = trait({ then: 0, delta: 0 });

		world.add(Time);
		expect(world.has(Time)).toBe(true);
		expect(world.has(Test)).toBe(true);

		// Does not show up in a query.
		const query = world.query(Time);
		expect(query.length).toBe(0);

		const time = world.get(Time)!;
		time.then = 1;
		time.delta = 1;
		world.set(Time, time);

		expect(time.then).toBe(1);
		expect(time.delta).toBe(1);

		world.remove(Time);
		expect(world.has(Time)).toBe(false);
	});

	it('should observe traits', () => {
		const TimeOfDay = trait({ hour: 0 });
		const world = createWorld(TimeOfDay);

		let timeOfDay: TraitInstance<typeof TimeOfDay> | undefined ;
		world.onChange(TimeOfDay, (e) => {
			timeOfDay = e.get(TimeOfDay);
		});

		world.set(TimeOfDay, { hour: 1 });
		expect(timeOfDay).toEqual({ hour: 1 });
	});
});
