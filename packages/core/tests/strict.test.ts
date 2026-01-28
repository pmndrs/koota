import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createWorld, setStrictMode, trait } from '../src';

const Position = trait({ x: 0, y: 0 });
const Velocity = trait({ vx: 0, vy: 0 });

describe('Strict Mode', () => {
	const world = createWorld();

	beforeEach(() => {
		world.reset();
	});

	afterEach(() => {
		setStrictMode(false);
	});

	describe('setStrictMode', () => {
		it('should accept boolean true as alias for always', () => {
			setStrictMode(true);
			const entity = world.spawn();
			entity.destroy();

			expect(() => entity.has(Position)).toThrow('[Koota]');
		});

		it('should accept boolean false as alias for off', () => {
			setStrictMode(false);
			const entity = world.spawn();
			entity.destroy();

			expect(() => entity.has(Position)).not.toThrow();
		});
	});

	describe('entity.add', () => {
		it('should throw when adding trait to dead entity', () => {
			setStrictMode('always');
			const entity = world.spawn();
			entity.destroy();

			expect(() => entity.add(Position)).toThrow('dead entity');
		});

		it('should throw when adding trait entity already has', () => {
			setStrictMode('always');
			const entity = world.spawn(Position);

			expect(() => entity.add(Position)).toThrow('already has');
		});
	});

	describe('entity.remove', () => {
		it('should throw when removing trait from dead entity', () => {
			setStrictMode('always');
			const entity = world.spawn(Position);
			entity.destroy();

			expect(() => entity.remove(Position)).toThrow('dead entity');
		});

		it('should throw when removing trait entity does not have', () => {
			setStrictMode('always');
			const entity = world.spawn();

			expect(() => entity.remove(Position)).toThrow('does not have');
		});
	});

	describe('entity.get', () => {
		it('should throw when getting trait from dead entity', () => {
			setStrictMode('always');
			const entity = world.spawn(Position);
			entity.destroy();

			expect(() => entity.get(Position)).toThrow('dead entity');
		});

		it('should throw when getting trait entity does not have', () => {
			setStrictMode('always');
			const entity = world.spawn();

			expect(() => entity.get(Position)).toThrow('does not have');
		});
	});

	describe('entity.set', () => {
		it('should throw when setting trait on dead entity', () => {
			setStrictMode('always');
			const entity = world.spawn(Position);
			entity.destroy();

			expect(() => entity.set(Position, { x: 1, y: 1 })).toThrow('dead entity');
		});

		it('should throw when setting trait entity does not have', () => {
			setStrictMode('always');
			const entity = world.spawn();

			expect(() => entity.set(Position, { x: 1, y: 1 })).toThrow('does not have');
		});
	});

	describe('entity.has', () => {
		it('should throw when checking trait on dead entity', () => {
			setStrictMode('always');
			const entity = world.spawn();
			entity.destroy();

			expect(() => entity.has(Position)).toThrow('dead entity');
		});
	});

	describe('entity.changed', () => {
		it('should throw when marking changed on dead entity', () => {
			setStrictMode('always');
			const entity = world.spawn(Position);
			entity.destroy();

			expect(() => entity.changed(Position)).toThrow('dead entity');
		});

		it('should throw when marking changed on trait entity does not have', () => {
			setStrictMode('always');
			const entity = world.spawn();

			expect(() => entity.changed(Position)).toThrow('does not have');
		});
	});

	describe('off mode', () => {
		it('should not throw when strict mode is off', () => {
			setStrictMode('off');
			const entity = world.spawn();
			entity.destroy();

			expect(() => entity.has(Position)).not.toThrow();
		});
	});
});
