import { afterEach, describe, expect, it } from 'vitest';
import {
  createAdded,
  createChanged,
  createRemoved,
  createWorld,
  IsExcluded,
  Not,
  Or,
  trait,
} from '../src';

const worlds: ReturnType<typeof createWorld>[] = [];
function create() {
  const world = createWorld();
  worlds.push(world);
  return world;
}
afterEach(() => {
  for (const world of worlds) world.destroy();
  worlds.length = 0;
});

describe('tracking query membership', () => {
  it.each([createAdded, createChanged, createRemoved])(
    'ignores bare spawns after compilation',
    (tracking) => {
      const world = create();
      const Track = tracking();
      const Value = trait({ x: 0 });
      expect(Array.from(world.query(Track(Value)))).toEqual([]);
      const bare = world.spawn();
      expect(Array.from(world.query(Track(Value)))).not.toContain(bare);
    }
  );

  it('applies required, forbidden, alternative and exclusion terms on first read', () => {
    const world = create();
    const Added = createAdded();
    const A = trait();
    const B = trait();
    const C = trait();
    const D = trait();
    const onlyA = world.spawn(A);
    world.spawn(A, B);
    const matching = world.spawn(A, C);
    world.spawn(A, C, IsExcluded);
    expect(Array.from(world.query(Added(A), Not(B)))).toEqual([onlyA, matching]);
    expect(Array.from(world.query(Added(A), C))).toEqual([matching]);
    expect(Array.from(world.query(Added(A), Or(C, D)))).toEqual([matching]);
  });

  it.each(['before', 'after'])('combines all tracking groups when compiled %s events', (when) => {
    const world = create();
    const Added = createAdded();
    const Changed = createChanged();
    const A = trait();
    const B = trait();
    const C = trait();
    const D = trait();
    const terms = [Added(A), Or(Changed(B), Added(C)), Added(D)] as const;
    if (when === 'before') expect(Array.from(world.query(...terms))).toEqual([]);
    world.spawn(A, D);
    world.spawn(C);
    const matching = world.spawn(B);
    matching.changed(B);
    matching.add(D, A);
    expect(Array.from(world.query(...terms))).toEqual([matching]);
  });

  it.each([createAdded, createChanged])('forgets a tracked trait when it is removed', (tracking) => {
    const world = create();
    const Track = tracking();
    const A = trait();
    const B = trait();
    expect(Array.from(world.query(Track(A, B)))).toEqual([]);
    const entity = world.spawn(A);
    entity.changed(A);
    entity.remove(A);
    entity.add(B);
    entity.changed(B);
    expect(Array.from(world.query(Track(A, B)))).toEqual([]);
    entity.add(A);
    entity.changed(A);
    expect(Array.from(world.query(Track(A, B)))).toEqual([entity]);
  });

  it('does not report changes from a removed value after reattachment', () => {
    const world = create();
    const Changed = createChanged();
    const A = trait({ x: 0 });
    const entity = world.spawn(A);
    entity.set(A, { x: 1 });
    entity.remove(A);
    entity.add(A);
    expect(Array.from(world.query(Changed(A)))).toEqual([]);
    entity.set(A, { x: 2 });
    expect(Array.from(world.query(Changed(A)))).toEqual([entity]);
  });

  it('retains partial history from first population until the remaining event occurs', () => {
    const world = create();
    const Added = createAdded();
    const Removed = createRemoved();
    const A = trait();
    const B = trait();
    const entity = world.spawn(A, B);
    expect(Array.from(world.query(Added(A), Removed(B)))).toEqual([]);
    entity.remove(B);
    expect(Array.from(world.query(Added(A), Removed(B)))).toEqual([entity]);
  });

  it('invalidates opposite events without dropping another matching Or branch', () => {
    const world = create();
    const Added = createAdded();
    const Removed = createRemoved();
    const A = trait();
    const B = trait();
    expect(Array.from(world.query(Or(Added(A), Removed(B))))).toEqual([]);
    const entity = world.spawn(A, B);
    entity.remove(B, A);
    expect(Array.from(world.query(Or(Added(A), Removed(B))))).toEqual([entity]);
    entity.add(B);
    expect(Array.from(world.query(Or(Added(A), Removed(B))))).toEqual([]);
  });
});
