import { describe, expect, it } from 'vitest';
import { $internal, createRemoved, createWorld, trait } from '../../src';
import { hasNativeGc, waitForFinalization } from '../utils/gc';

describe('Shared mask tables', () => {
  it('packs the first 30 user traits in one mask table after resetting the last world', () => {
    const world = createWorld();
    const tags = Array.from({ length: 31 }, () => trait());
    world.spawn(...tags);
    world.reset();

    const entity = world.spawn(...tags.slice(0, 30));
    expect(world[$internal].entityMasks).toHaveLength(1);
    expect(world.query(tags[0], tags[29]).toArray()).toEqual([entity]);
    world.destroy();
  });

  it.skipIf(!hasNativeGc())(
    'releases mask tables when the last shared world is destroyed',
    async () => {
      await expect(
        waitForFinalization((registry) => {
          const world = createWorld();
          world.spawn(...Array.from({ length: 31 }, () => trait()));
          registry.register(world[$internal].entityMasks[1], 'mask table');
          world.destroy();
        })
      ).resolves.toBe(true);
    },
    20_000
  );

  it('tracks only the mask generations used in each world', () => {
    const large = createWorld();
    const small = createWorld({ retain: 1 });
    const tags = Array.from({ length: 124 }, () => trait());
    const original = large.spawn(...tags);
    const tag = tags[123];
    const first = small.spawn(tag);
    const second = small.spawn(tag);
    const removed = createRemoved();
    small.query(removed(tag));

    expect(small[$internal].entityMasks.length).toBeLessThanOrEqual(2);
    first.destroy();
    second.destroy();
    expect(small.query(removed(tag)).toArray()).toEqual([second]);
    expect(original.has(tag)).toBe(true);
    large.destroy();
    expect(small.spawn(tag).has(tag)).toBe(true);
    small.destroy();
  });
});
