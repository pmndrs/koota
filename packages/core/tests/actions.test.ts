import { createActions } from '../src/actions/create-actions';
import { createWorld } from '../src';
import { trait } from '../src';
import { beforeEach, describe, expect, it } from 'vitest';

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

		const { spawnPlayer, destroyPlayers } = actions(world);

		const player = spawnPlayer();
		expect(player.has(IsPlayer)).toBe(true);

		const { spawnPlayer: spawnPlayer2 } = actions(world);

		// Should be the same function
		expect(spawnPlayer2).toBe(spawnPlayer);
	});
});
