import { describe, expect, it, vi } from 'vitest';
import {
  addTrait,
  addTraits,
  changed,
  collect,
  createEntity,
  createTracker,
  createWorld,
  defineTrait,
  destroyEntity,
  getArchetype,
  getQueryVersion,
  getTrait,
  getValue,
  hasTrait,
  isSparseTrait,
  markChanged,
  not,
  observe,
  or,
  removed,
  removeTrait,
  resetWorld,
  resolveQuery,
  setTrait,
  setTraitHooks,
  setValue,
  subscribeQuery,
  type Entity,
} from '../index';

describe('Sparse traits', () => {
  it('registers as sparse and never enters an archetype', () => {
    const Position = defineTrait({ x: 0 });
    const Stunned = defineTrait(undefined, { sparse: true });
    const Buff = defineTrait({ amount: 1 }, { sparse: true });
    expect(isSparseTrait(Stunned)).toBe(true);
    expect(isSparseTrait(Buff)).toBe(true);
    expect(isSparseTrait(Position)).toBe(false);

    const world = createWorld();
    const e = createEntity(world, [[Position, { x: 1 }]]);
    const before = getArchetype(world, e)!;
    addTrait(world, e, Stunned);
    addTrait(world, e, Buff, { amount: 3 });
    expect(getArchetype(world, e)).toBe(before);
    expect(world.archetypes.length).toBe(2);
    expect(hasTrait(world, e, Stunned)).toBe(true);
    expect(getTrait(world, e, Buff)).toEqual({ amount: 3 });
    removeTrait(world, e, Stunned);
    expect(hasTrait(world, e, Stunned)).toBe(false);
    expect(getArchetype(world, e)).toBe(before);
  });

  it('reads, writes, and marks sparse data through the store', () => {
    const Buff = defineTrait({ amount: 1, label: 'none' }, { sparse: true });
    const world = createWorld();
    const e = createEntity(world, [[Buff, { amount: 2 }]]);
    expect(getTrait(world, e, Buff)).toEqual({ amount: 2, label: 'none' });
    expect(setTrait(world, e, Buff, { label: 'haste' })).toBe(true);
    expect(getValue(world, e, Buff, 'label')).toBe('haste');
    expect(setValue(world, e, Buff, 'amount', 9)).toBe(true);
    expect(getTrait(world, e, Buff)).toEqual({ amount: 9, label: 'haste' });
    const changes: number[] = [];
    observe(world, 'traitChanged', (type, entity) => changes.push(type, entity));
    expect(markChanged(world, e, Buff)).toBe(true);
    expect(changes).toEqual([Buff, e]);
    const other = createEntity(world);
    expect(getTrait(world, other, Buff)).toBeUndefined();
    expect(setTrait(world, other, Buff, { amount: 1 })).toBe(false);
  });

  it('applies spawn entries and batch adds without moving the entity', () => {
    const Position = defineTrait({ x: 0 });
    const Tag = defineTrait();
    const Stunned = defineTrait(undefined, { sparse: true });
    const Buff = defineTrait({ amount: 1 }, { sparse: true });
    const world = createWorld();
    const e = createEntity(world, [Position, Stunned, [Buff, { amount: 4 }]]);
    expect(getArchetype(world, e)!.types).toEqual([Position]);
    expect(hasTrait(world, e, Stunned)).toBe(true);
    expect(getTrait(world, e, Buff)).toEqual({ amount: 4 });
    const f = createEntity(world);
    addTraits(world, f, [Tag, Stunned, [Buff, { amount: 5 }]]);
    expect(getArchetype(world, f)!.types).toEqual([Tag]);
    expect(getTrait(world, f, Buff)).toEqual({ amount: 5 });
  });

  it('keeps stores consistent across swap-removes and destruction', () => {
    const Stunned = defineTrait({ v: 0 }, { sparse: true });
    const world = createWorld();
    const entities = Array.from({ length: 5 }, (_, i) => createEntity(world, [[Stunned, { v: i }]]));
    removeTrait(world, entities[1], Stunned);
    destroyEntity(world, entities[0]);
    for (let i = 2; i < 5; i++) expect(getTrait(world, entities[i], Stunned)).toEqual({ v: i });
    expect(world.stores.get(Stunned)!.sources.length).toBe(3);
    const observed: number[] = [];
    observe(world, 'traitRemoving', (type, entity) => observed.push(type, entity));
    destroyEntity(world, entities[4]);
    expect(observed).toEqual([Stunned, entities[4]]);
    expect(world.stores.get(Stunned)!.sources.length).toBe(2);
    expect(world.externals[entities[4] & 0x1fffff]).toEqual([]);
  });

  it('runs definition hooks from the store paths', () => {
    const Buff = defineTrait({ amount: 1 }, { sparse: true });
    const onAdd = vi.fn((_w, _e, _t, value: unknown) => {
      (value as { amount: number }).amount += 10;
    });
    const onSet = vi.fn((_w, _e, _t, value: unknown) => {
      (value as { amount: number }).amount *= 2;
    });
    const onRemove = vi.fn();
    setTraitHooks(Buff, { onAdd, onSet, onRemove });
    const world = createWorld();
    const e = createEntity(world);
    addTrait(world, e, Buff, { amount: 1 });
    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(onSet).toHaveBeenCalledTimes(1);
    expect(getTrait(world, e, Buff)).toEqual({ amount: 2 });
    setTrait(world, e, Buff, { amount: 3 });
    expect(getTrait(world, e, Buff)).toEqual({ amount: 6 });
    removeTrait(world, e, Buff);
    expect(onRemove).toHaveBeenCalledWith(world, e, Buff, { amount: 6 });
  });

  it('matches queries by entity, starting from the smaller side', () => {
    const Position = defineTrait({ x: 0 });
    const Tag = defineTrait();
    const Stunned = defineTrait(undefined, { sparse: true });
    const world = createWorld();
    const all: Entity[] = [];
    for (let i = 0; i < 100; i++) all.push(createEntity(world, i % 2 === 0 ? [Position] : [Position, Tag]));
    // Rare: the store is the candidate source.
    addTrait(world, all[3], Stunned);
    addTrait(world, all[10], Stunned);
    const stunned = resolveQuery(world, [Position, Stunned]);
    expect(collect(world, stunned).sort()).toEqual([all[3], all[10]].sort());
    expect(collect(world, resolveQuery(world, [Tag, Stunned]))).toEqual([all[3]]);
    expect(collect(world, resolveQuery(world, [Stunned]))).toHaveLength(2);
    expect(collect(world, resolveQuery(world, [Position, not(Stunned)]))).toHaveLength(98);
    // Common: the archetype rows are the candidate source and give the same answer.
    for (let i = 0; i < 100; i++) addTrait(world, all[i], Stunned);
    expect(collect(world, stunned)).toHaveLength(100);
    expect(collect(world, resolveQuery(world, [Tag, Stunned]))).toHaveLength(50);
    removeTrait(world, all[7], Stunned);
    expect(collect(world, resolveQuery(world, [Position, not(Stunned)]))).toEqual([all[7]]);
    // Or across storage kinds.
    const Other = defineTrait();
    addTrait(world, all[7], Other);
    expect(collect(world, resolveQuery(world, [or(Other, Stunned)]))).toHaveLength(100);
  });

  it('tracks added, changed, and removed on sparse traits', () => {
    const Buff = defineTrait({ amount: 1 }, { sparse: true });
    const world = createWorld();
    const a = createEntity(world);
    const b = createEntity(world);
    const tracker = createTracker();
    const changedQuery = resolveQuery(world, [changed(Buff, tracker)]);
    const removedQuery = resolveQuery(world, [removed(Buff, tracker)]);
    addTrait(world, a, Buff);
    addTrait(world, b, Buff, { amount: 2 });
    expect(collect(world, changedQuery)).toEqual([b]);
    expect(collect(world, changedQuery)).toEqual([]);
    setValue(world, a, Buff, 'amount', 5);
    expect(collect(world, changedQuery)).toEqual([a]);
    removeTrait(world, b, Buff);
    expect(collect(world, removedQuery)).toEqual([b]);
    expect(collect(world, removedQuery)).toEqual([]);
  });

  it('maintains observed membership without archetype moves', () => {
    const Position = defineTrait({ x: 0 });
    const Stunned = defineTrait(undefined, { sparse: true });
    const world = createWorld();
    const e = createEntity(world, [Position]);
    const query = resolveQuery(world, [Position, Stunned]);
    const adds: Entity[] = [];
    const removes: Entity[] = [];
    subscribeQuery(world, query, 'add', (entity) => adds.push(entity));
    subscribeQuery(world, query, 'remove', (entity) => removes.push(entity));
    const v0 = getQueryVersion(world, query);
    addTrait(world, e, Stunned);
    expect(adds).toEqual([e]);
    expect(getQueryVersion(world, query)).not.toBe(v0);
    removeTrait(world, e, Stunned);
    expect(removes).toEqual([e]);
    addTrait(world, e, Stunned);
    removeTrait(world, e, Position);
    expect(removes).toEqual([e, e]);
    destroyEntity(world, e);
    expect(collect(world, query)).toEqual([]);
  });

  it('clears stores on reset', () => {
    const Stunned = defineTrait(undefined, { sparse: true });
    const world = createWorld();
    const e = createEntity(world, [Stunned]);
    resetWorld(world);
    expect(world.stores.size).toBe(0);
    expect(hasTrait(world, e, Stunned)).toBe(false);
    const f = createEntity(world, [Stunned]);
    expect(collect(world, resolveQuery(world, [Stunned]))).toEqual([f]);
  });
});
