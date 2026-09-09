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

  it('keeps caches per world and recreates actions after reset', () => {
    const first = createWorld();
    const second = createWorld();
    const actions = createActions((world) => ({ spawn: () => world.spawn(IsPlayer) }));
    try {
      const original = actions(first);
      const other = actions(second);
      expect(original).not.toBe(other);
      first.reset();
      const replacement = actions(first);
      expect(replacement).not.toBe(original);
      expect(actions(first)).toBe(replacement);
      expect(actions(second)).toBe(other);
      expect(replacement.spawn().has(IsPlayer)).toBe(true);
    } finally {
      first.destroy();
      second.destroy();
    }
  });
});
