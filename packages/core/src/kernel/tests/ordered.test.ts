import { describe, expect, it } from 'vitest';
import {
  addPair,
  collect,
  createEntity,
  createWorld,
  defineRelation,
  destroyEntity,
  getQueryVersion,
  getSources,
  observeQuery,
  pair,
  removePair,
  resolveQuery,
  setSources,
} from '../index';

describe('Ordered relations', () => {
  it('keeps sources in insertion order across adds and removes', () => {
    const ChildOf = defineRelation({ ordered: true });
    const world = createWorld();
    const parent = createEntity(world);
    const a = createEntity(world, [pair(ChildOf, parent)]);
    const b = createEntity(world, [pair(ChildOf, parent)]);
    const c = createEntity(world, [pair(ChildOf, parent)]);
    expect(getSources(world, ChildOf, parent)).toEqual([a, b, c]);
    removePair(world, a, ChildOf, parent);
    expect(getSources(world, ChildOf, parent)).toEqual([b, c]);
    addPair(world, a, ChildOf, parent);
    expect(getSources(world, ChildOf, parent)).toEqual([b, c, a]);
    destroyEntity(world, c);
    expect(getSources(world, ChildOf, parent)).toEqual([b, a]);
    expect(world.stores.get(pair(ChildOf, parent))!.order).toEqual([b, a]);
  });

  it('leaves relations without the flag unordered and free of the list', () => {
    const Plain = defineRelation();
    const world = createWorld();
    const parent = createEntity(world);
    createEntity(world, [pair(Plain, parent)]);
    expect(world.stores.get(pair(Plain, parent))!.order).toBeNull();
    expect(setSources(world, Plain, parent, getSources(world, Plain, parent))).toBe(false);
  });

  it('returns pair queries in order and bumps observed versions on reorder', () => {
    const ChildOf = defineRelation({ ordered: true });
    const world = createWorld();
    const parent = createEntity(world);
    const a = createEntity(world, [pair(ChildOf, parent)]);
    const b = createEntity(world, [pair(ChildOf, parent)]);
    const c = createEntity(world, [pair(ChildOf, parent)]);
    const query = resolveQuery(world, [pair(ChildOf, parent)]);
    observeQuery(world, query);
    expect(collect(world, query)).toEqual([a, b, c]);
    const version = getQueryVersion(world, query);
    expect(setSources(world, ChildOf, parent, [c, a, b])).toBe(true);
    expect(collect(world, query)).toEqual([c, a, b]);
    expect(getSources(world, ChildOf, parent)).toEqual([c, a, b]);
    expect(getQueryVersion(world, query)).not.toBe(version);
  });

  it('rejects reorders that change the set', () => {
    const ChildOf = defineRelation({ ordered: true });
    const world = createWorld();
    const parent = createEntity(world);
    const a = createEntity(world, [pair(ChildOf, parent)]);
    const b = createEntity(world, [pair(ChildOf, parent)]);
    const stranger = createEntity(world);
    expect(setSources(world, ChildOf, parent, [a])).toBe(false);
    expect(setSources(world, ChildOf, parent, [a, a])).toBe(false);
    expect(setSources(world, ChildOf, parent, [a, stranger])).toBe(false);
    expect(setSources(world, ChildOf, parent, [b, a, stranger])).toBe(false);
    expect(getSources(world, ChildOf, parent)).toEqual([a, b]);
    expect(setSources(world, ChildOf, stranger, [])).toBe(true);
  });
});
