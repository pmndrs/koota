import { beforeEach, describe, expect, it } from 'vitest';
import { createWorld, TraitInstance } from '../src';
import { trait } from '../src/trait/trait';
import { universe } from '../src/universe/universe';

describe('World', () => {
	beforeEach(() => {
		universe.reset();
	});

	it('should create a world', () => {
		const world = createWorld();

		// World inits on creation.

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

		let timeOfDay: TraitInstance<typeof TimeOfDay> | undefined = undefined;
		world.onChange(TimeOfDay, (e) => {
			timeOfDay = e.get(TimeOfDay);
		});

		world.set(TimeOfDay, { hour: 1 });
		expect(timeOfDay).toEqual({ hour: 1 });
	});

	it('should preserve subscriptions when reset with preserveSubscriptions', () => {
		const world = createWorld();
		const Position = trait({ x: 0, y: 0 });

		let addCounter = 0;
		let removeCounter = 0;

		world.onAdd([Position], (entity) => {
			addCounter += 1;
		});

		world.onRemove([Position], (entity) => {
			removeCounter += 1;
		});

		const entity = world.spawn(Position);
		expect(addCounter).toBe(1);

		let results = world.query(Position);
		expect(results.length).toBe(1);

		world.reset({ preserveSubscriptions: true });
		expect(addCounter).toBe(1);
		expect(removeCounter).toBe(0);

		results = world.query(Position);
		expect(results.length).toBe(0);

		world.spawn(Position);
		expect(addCounter).toBe(2);

		results = world.query(Position);
		expect(results.length).toBe(1);

		entity.destroy();
		expect(removeCounter).toBe(1);
	});
});
