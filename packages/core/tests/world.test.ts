import { beforeEach, describe, expect, it } from 'vitest';
import { universe } from '../src/universe/universe';
import { define } from '../src/component/component';
import { createWorld } from '../src';

describe('World', () => {
	beforeEach(() => {
		universe.reset();
	});

	it('should create a world', () => {
		const world = createWorld();

		// World inits on creation.

		expect(world.isInitialized).toBe(true);
		expect(universe.worlds.length).toBe(1);
	});

	it('can create a world without initing', () => {
		const world = createWorld({ init: false });

		expect(world.isInitialized).toBe(false);
		expect(universe.worlds.length).toBe(0);

		world.init();

		expect(world.isInitialized).toBe(true);
		expect(universe.worlds.length).toBe(1);
	});

	it('should reset the world', () => {
		const world = createWorld();
		world.reset();

		expect(world.entities.length).toBe(0);
	});

	it('should add, remove and get resources', () => {
		const world = createWorld();

		const Time = define({ then: 0, delta: 0 });

		world.resources.add(Time);
		expect(world.resources.has(Time)).toBe(true);

		const time = world.resources.get(Time);
		time.then = 1;
		time.delta = 1;

		expect(time.then).toBe(1);
		expect(time.delta).toBe(1);

		world.resources.remove(Time);
		expect(world.resources.has(Time)).toBe(false);
	});
});
