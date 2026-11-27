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
        for (const e of world.query(IsPlayer)) e.destroy();
      },
    }));

    const { spawnPlayer } = actions(world);

    const player = spawnPlayer();
    expect(player.has(IsPlayer)).toBe(true);

    const { spawnPlayer: spawnPlayer2 } = actions(world);

    // Should be the same function
    expect(spawnPlayer2).toBe(spawnPlayer);

    // A second set of actions is memoized on its own for the same world.
    const otherActions = createActions((world) => ({
      spawnPlayer: () => world.spawn(IsPlayer),
    }));
    expect(otherActions(world).spawnPlayer).not.toBe(spawnPlayer);
  });
});
