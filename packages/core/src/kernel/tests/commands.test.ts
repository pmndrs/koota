import { describe, expect, it } from 'vitest';
import {
  abortMutation,
  addTrait,
  addTraitNow,
  addTraits,
  beginMutation,
  createEntity,
  createEntityNow,
  createWorld,
  defineRelation,
  defineTrait,
  destroyEntity,
  destroyEntityNow,
  endMutation,
  entityCount,
  getTrait,
  hasTrait,
  isAlive,
  observe,
  pair,
  removeTrait,
  resetWorld,
  setTrait,
  setTraitHooks,
  setValue,
  type Entity,
} from '../index';

describe('Mutation scopes and commands', () => {
  it('queues mutations issued by hooks and plays them after the operation', () => {
    const A = defineTrait();
    const B = defineTrait();
    let sawB: boolean | undefined;
    setTraitHooks(A, {
      onAdd(world, entity) {
        addTrait(world, entity, B);
        sawB = hasTrait(world, entity, B);
      },
    });
    const world = createWorld();
    const order: number[] = [];
    observe(world, 'traitAdded', (type) => order.push(type));
    const e = createEntity(world);
    addTrait(world, e, A);
    expect(sawB).toBe(false);
    expect(hasTrait(world, e, B)).toBe(true);
    expect(order).toEqual([A, B]);
    expect(world.queue.kinds.length).toBe(0);
  });

  it('queues mutations issued by observers', () => {
    const A = defineTrait({ x: 0 });
    const world = createWorld();
    let seen: unknown;
    observe(world, 'traitAdded', (type, entity) => {
      if (type !== A) return;
      setTrait(world, entity, A, { x: 5 });
      seen = getTrait(world, entity, A);
    });
    const e = createEntity(world, [[A, { x: 1 }]]);
    expect(seen).toEqual({ x: 1 });
    expect(getTrait(world, e, A)).toEqual({ x: 5 });
  });

  it('defers creation to a reserved entity that reads dead until played', () => {
    const A = defineTrait();
    const B = defineTrait();
    let spawned: Entity = 0;
    let aliveInside: boolean | undefined;
    setTraitHooks(A, {
      onAdd(world) {
        spawned = createEntity(world, [B]);
        aliveInside = isAlive(world, spawned);
      },
    });
    const world = createWorld();
    const e = createEntity(world, [A]);
    expect(aliveInside).toBe(false);
    expect(isAlive(world, spawned)).toBe(true);
    expect(hasTrait(world, spawned, B)).toBe(true);
    expect(spawned).not.toBe(e);
    expect(entityCount(world)).toBe(2);
  });

  it('destroys after the add completes when a hook destroys its own entity', () => {
    const A = defineTrait();
    setTraitHooks(A, { onAdd: (world, entity) => void destroyEntity(world, entity) });
    const world = createWorld();
    let aliveAtAdded: boolean | undefined;
    observe(world, 'traitAdded', (_type, entity) => {
      aliveAtAdded = isAlive(world, entity);
    });
    const e = createEntity(world);
    addTrait(world, e, A);
    expect(aliveAtAdded).toBe(true);
    expect(isAlive(world, e)).toBe(false);
  });

  it('discards queued work and retires reservations when an operation throws', () => {
    const A = defineTrait();
    const B = defineTrait();
    let spawned: Entity = 0;
    setTraitHooks(A, {
      onAdd(world, entity) {
        spawned = createEntity(world, [B]);
        addTrait(world, entity, B);
        throw new Error('boom');
      },
    });
    const world = createWorld();
    const e = createEntity(world);
    expect(() => addTrait(world, e, A)).toThrow('boom');
    expect(hasTrait(world, e, A)).toBe(true);
    expect(hasTrait(world, e, B)).toBe(false);
    expect(isAlive(world, spawned)).toBe(false);
    expect(world.queue.kinds.length).toBe(0);
    const next = createEntity(world);
    expect(next).not.toBe(spawned);
    expect(isAlive(world, spawned)).toBe(false);
    expect(world.depth).toBe(0);
  });

  it('plays commands queued during playback in order', () => {
    const A = defineTrait();
    const B = defineTrait();
    const C = defineTrait();
    setTraitHooks(A, { onAdd: (world, entity) => void addTrait(world, entity, B) });
    setTraitHooks(B, { onAdd: (world, entity) => void addTrait(world, entity, C) });
    const world = createWorld();
    const order: number[] = [];
    observe(world, 'traitAdded', (type) => order.push(type));
    const e = createEntity(world, [A]);
    expect(order).toEqual([A, B, C]);
    expect(hasTrait(world, e, C)).toBe(true);
  });

  it('skips pair commands whose target was recycled before playback', () => {
    const Rel = defineRelation();
    const world = createWorld();
    const e = createEntity(world);
    const target = createEntity(world);
    beginMutation(world);
    addTrait(world, e, pair(Rel, target));
    destroyEntityNow(world, target);
    const recycled = createEntityNow(world);
    endMutation(world);
    expect(recycled & 0x1fffff).toBe(target & 0x1fffff);
    expect(hasTrait(world, e, pair(Rel, recycled))).toBe(false);
  });

  it('applies immediate calls inside an explicit scope and queues deferring ones', () => {
    const A = defineTrait();
    const B = defineTrait();
    const world = createWorld();
    const e = createEntity(world);
    beginMutation(world);
    addTraitNow(world, e, A);
    expect(hasTrait(world, e, A)).toBe(true);
    addTrait(world, e, B);
    expect(hasTrait(world, e, B)).toBe(false);
    endMutation(world);
    expect(hasTrait(world, e, B)).toBe(true);
  });

  it('aborting a scope retires its reservations', () => {
    const world = createWorld();
    beginMutation(world);
    const reserved = createEntity(world);
    abortMutation(world);
    expect(isAlive(world, reserved)).toBe(false);
    const next = createEntity(world);
    expect(next & 0x1fffff).toBe(reserved & 0x1fffff);
    expect(next).not.toBe(reserved);
    expect(isAlive(world, reserved)).toBe(false);
  });

  it('refuses reset during a mutation and retires reservations on reset', () => {
    const A = defineTrait();
    const world = createWorld();
    let reserved: Entity = 0;
    setTraitHooks(A, {
      onAdd(w) {
        expect(() => resetWorld(w)).toThrow('during a mutation');
        reserved = createEntity(w);
        expect(isAlive(w, reserved)).toBe(false);
      },
    });
    const e = createEntity(world, [A]);
    expect(isAlive(world, reserved)).toBe(true);
    void e;
    const world2 = createWorld();
    beginMutation(world2);
    const pending = createEntity(world2);
    endMutation(world2);
    expect(isAlive(world2, pending)).toBe(true);
    resetWorld(world2);
    expect(isAlive(world2, pending)).toBe(false);
  });

  it('queues batch adds, removals, field writes, and changes', () => {
    const A = defineTrait({ x: 0, y: 0 });
    const B = defineTrait();
    const Aos = defineTrait(() => ({ v: 1 }));
    const Rel = defineRelation();
    const world = createWorld();
    const target = createEntity(world);
    const e = createEntity(world, [[A, { x: 1, y: 2 }], B, Aos]);
    const instance = { v: 9 };
    const changes: number[] = [];
    observe(world, 'traitChanged', (type) => changes.push(type));
    beginMutation(world);
    addTraits(world, e, [[pair(Rel, target), undefined]]);
    removeTrait(world, e, B);
    setValue(world, e, A, 'x', 7);
    setValue(world, e, Aos, 'value', instance);
    endMutation(world);
    expect(hasTrait(world, e, pair(Rel, target))).toBe(true);
    expect(hasTrait(world, e, B)).toBe(false);
    expect(getTrait(world, e, A)).toEqual({ x: 7, y: 2 });
    expect(getTrait(world, e, Aos)).toBe(instance);
    expect(changes).toEqual([A, Aos]);
  });
});
