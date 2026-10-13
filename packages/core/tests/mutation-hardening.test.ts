import { afterEach, describe, expect, it } from 'vitest';
import { createWorld, trait, type ConfigurableTrait, type Entity, type World } from '../src';
import { registry } from '../src/api/handles';
import type { WorldState } from '../src/api/world/state';

/** Mutation paths under stress: resets, failures and entities of other worlds. */

const worlds: World[] = [];
function create(): World {
  const world = createWorld();
  worlds.push(world);
  return world;
}
afterEach(() => {
  for (const world of worlds) world.destroy();
  worlds.length = 0;
});

describe('world reset', () => {
  it('drops entities that destroy subscribers spawn during a reset', () => {
    const world = create();
    const A = trait({ v: 0 });
    const B = trait();
    const made: Entity[] = [];
    world.onEntityDestroy(() => {
      if (made.length < 3) made.push(world.spawn(A({ v: -1 })));
    });
    for (let i = 0; i < 20; i++) world.spawn(A);
    world.reset();
    expect(made).toHaveLength(3);
    expect(made.some((entity) => entity.isAlive())).toBe(false);
    expect(world.query(A)).toHaveLength(0);
    const after = Array.from({ length: 20 }, (_, i) => world.spawn(A({ v: i })));
    for (const entity of after) entity.add(B);
    expect(after.map((entity) => entity.get(A)!.v)).toEqual(Array.from({ length: 20 }, (_, i) => i));
    expect(made.some((entity) => entity.isAlive())).toBe(false);
  });
});

describe('world.has', () => {
  it('answers only for entities of its own world', () => {
    const world = create();
    const other = create();
    const mine = world.spawn();
    const theirs = other.spawn();
    expect(world.has(mine)).toBe(true);
    expect(world.has(theirs)).toBe(false);
    expect(other.has(theirs)).toBe(true);
    theirs.destroy();
    expect(other.has(theirs)).toBe(false);
  });
});

describe('handle allocation failure', () => {
  it('returns the kernel slot when a spawn cannot get a handle', () => {
    const world = create();
    const A = trait({ v: 0 });
    const Hooked = trait().onAdd(() => {});
    // Fill the world's page so the next spawn needs a page the registry cannot give.
    const spawned: Entity[] = [];
    for (;;) {
      const entity = world.spawn(A);
      spawned.push(entity);
      if ((entity.id() & 1023) === 1023) break;
    }
    const kernel = (registry.worlds[world.id] as WorldState).kernel!;
    const cursor = registry.pageCursor;
    const freePages = registry.freePages.splice(0);
    registry.pageCursor = 1 << 12;
    // Kernel slots in use: every slot ever made minus the free ones.
    const used = () => kernel.next - kernel.free.length;
    try {
      const before = used();
      const buffer = world.createCommandBuffer();
      for (const traits of [[A], [Hooked], [A({ v: 1 })]] as ConfigurableTrait[][]) {
        for (let i = 0; i < 3; i++) {
          expect(() => world.spawn(...traits)).toThrow('entity pages');
          expect(() => buffer.spawn(...traits)).toThrow('entity pages');
        }
        expect(used()).toBe(before);
      }
      expect(buffer.size).toBe(0);
    } finally {
      registry.pageCursor = cursor;
      registry.freePages.push(...freePages);
    }
    const next = world.spawn(A({ v: 3 }));
    expect(next.get(A)).toEqual({ v: 3 });
    expect(world.query(A)).toHaveLength(spawned.length + 1);
  });
});
