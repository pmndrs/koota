import { beforeEach, describe, expect, it } from 'vitest';
import { createActions, createWorld, trait } from '../src';

const IsPlayer = trait();

describe('Actions', () => {
	const world = createWorld();

	beforeEach(() => {
		world.reset();
	});

	it('should create memoized actions', () => {
		const actions = createActions((world) => ({
			spawnPlayer: () => world.spawn(IsPlayer),
			destroyPlayers: () => {
				world.query(IsPlayer).forEach((e) => e.destroy());
			},
		}));

		const { spawnPlayer } = actions(world);

		const player = spawnPlayer();
		expect(player.has(IsPlayer)).toBe(true);

		const { spawnPlayer: spawnPlayer2 } = actions(world);

		// Should be the same function
		expect(spawnPlayer2).toBe(spawnPlayer);
	});

	it('should create multiple memoized actions per world', () => {
		const actions1 = createActions((world) => ({
			spawnPlayer: () => world.spawn(IsPlayer),
			destroyPlayers: () => {
				world.query(IsPlayer).forEach((e) => e.destroy());
			},
		}));

		const actions2 = createActions((world) => ({
			spawnPlayer: () => world.spawn(IsPlayer),
			destroyPlayers: () => {
				world.query(IsPlayer).forEach((e) => e.destroy());
			},
		}));

		const { spawnPlayer: spawnPlayer1 } = actions1(world);
		const { spawnPlayer: spawnPlayer2 } = actions2(world);

		// Should be different functions
		expect(spawnPlayer1).not.toBe(spawnPlayer2);
	});

	it('should create actions with context', () => {
		const actions = createActions((world, context: { count: number }) => ({
			addToCount: (amount: number) => {
				context.count += amount;
			},
			resetCount: () => {
				context.count = 0;
			},
		}));

		const context = { count: 0 };
		const { addToCount, resetCount } = actions(world, context);

		addToCount(1);
		expect(context.count).toBe(1);

		addToCount(2);
		expect(context.count).toBe(3);

		resetCount();
		expect(context.count).toBe(0);
	});
});
