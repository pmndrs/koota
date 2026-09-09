import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createWorld, relation, trait, type World } from '../src';

describe('Trait hooks', () => {
  let world: World;
  beforeEach(() => {
    world = createWorld();
  });
  afterEach(() => {
    world.destroy();
  });

  it('initializes before add hooks and publishes hook writes before observers', () => {
    const order: string[] = [];
    const Position = trait(
      { x: 0, y: 1 },
      {
        onAdd(value, entity) {
          expect(value).toEqual({ x: 3, y: 1 });
          expect(world.query(Position)).toContain(entity);
          value.x *= 2;
          order.push('hook');
        },
      }
    );
    world.onQueryAdd([Position], (entity) => {
      expect(entity.get(Position)).toEqual({ x: 6, y: 1 });
      order.push('query');
    });
    world.onAdd(Position, () => order.push('observer'));
    world.spawn(Position({ x: 3 }));
    expect(order).toEqual(['hook', 'observer', 'query']);
  });

  it('runs remove observers and hooks while the departing value remains accessible', () => {
    const order: string[] = [];
    const Position = trait(
      { x: 0 },
      {
        onRemove(value, entity) {
          expect(value.x).toBe(3);
          expect(entity.has(Position)).toBe(true);
          order.push('hook');
        },
      }
    );
    const entity = world.spawn(Position({ x: 3 }));
    world.onRemove(Position, () => order.push('observer'));
    world.onQueryRemove([Position], () => {
      expect(entity.has(Position)).toBe(false);
      expect(world.query(Position)).not.toContain(entity);
      order.push('query');
    });
    entity.remove(Position);
    expect(order).toEqual(['observer', 'hook', 'query']);
  });

  it('runs set hooks before change observers and detects writes in updateEach', () => {
    const hook = vi.fn((value: { x: number }) => {
      value.x = Math.max(0, value.x);
    });
    const Position = trait({ x: 0 }, { onSet: hook });
    const entity = world.spawn(Position);
    expect(hook).not.toHaveBeenCalled();
    const values: number[] = [];
    world.onChange(Position, () => values.push(entity.get(Position)!.x));
    entity.set(Position, { x: -1 });
    world.query(Position).updateEach(([position]) => {
      position.x = -2;
    });
    expect(hook).toHaveBeenCalledTimes(2);
    expect(values).toEqual([0, 0]);
  });

  it('detects updateEach writes when a set hook is the only listener', () => {
    const hook = vi.fn();
    const Position = trait({ x: 0 }, { onSet: hook });
    world.spawn(Position);
    world.query(Position).updateEach(([position]) => {
      position.x = 1;
    });
    expect(hook).toHaveBeenCalledOnce();
  });

  it('finishes the current lifecycle before applying mutations requested by hooks', () => {
    const order: string[] = [];
    const B = trait(undefined, {
      onAdd() {
        order.push('b');
      },
    });
    const A = trait(undefined, {
      onAdd(_value, entity) {
        order.push('a');
        entity.add(B);
        expect(entity.has(B)).toBe(false);
      },
    });
    world.onAdd(A, (entity) => {
      expect(entity.has(B)).toBe(false);
      order.push('observer');
    });
    const entity = world.spawn(A);
    expect(entity.has(B)).toBe(true);
    expect(order).toEqual(['a', 'observer', 'b']);
  });

  it('supports object storage hooks and does not repeat hooks for duplicate adds', () => {
    const onAdd = vi.fn((value: { items: string[] }) => {
      value.items.push('ready');
    });
    const Resource = trait(() => ({ items: [] as string[] }), { onAdd });
    const entity = world.spawn(Resource);
    entity.add(Resource);
    expect(onAdd).toHaveBeenCalledOnce();
    expect(entity.get(Resource)!.items).toEqual(['ready']);
  });

  it('queues structural and data operations requested by a hook', () => {
    const Position = trait({ x: 0 });
    const Tag = trait();
    const entity = world.spawn(Position, Tag);
    const discarded = world.spawn();
    const changed = vi.fn();
    world.onChange(Position, changed);
    const Trigger = trait(undefined, {
      onAdd() {
        entity.set(Position, { x: 2 }, false);
        entity.changed(Position);
        entity.remove(Tag);
        discarded.destroy();
        const spawned = world.spawn(Tag);
        expect(spawned.isAlive()).toBe(false);
        expect(entity.get(Position)).toEqual({ x: 0 });
        expect(entity.has(Tag)).toBe(true);
        expect(discarded.isAlive()).toBe(true);
        expect(changed).not.toHaveBeenCalled();
      },
    });
    world.add(Trigger);
    expect(entity.get(Position)).toEqual({ x: 2 });
    expect(entity.has(Tag)).toBe(false);
    expect(discarded.isAlive()).toBe(false);
    expect(world.query(Tag)).toHaveLength(1);
    expect(changed).toHaveBeenCalledOnce();
  });

  it('runs set hooks while allowing change notifications to be suppressed', () => {
    const onSet = vi.fn();
    const observer = vi.fn();
    const Position = trait({ x: 0 }, { onSet });
    const entity = world.spawn(Position);
    world.onChange(Position, observer);
    entity.set(Position, { x: 2 }, false);
    expect(onSet).toHaveBeenCalledOnce();
    expect(observer).not.toHaveBeenCalled();
  });

  it('provides relation hooks with initialized pair data and consistent reverse indexes', () => {
    const parent = world.spawn();
    const removed = vi.fn();
    const ChildOf = relation({
      store: { weight: 0 },
      hooks: {
        onAdd(value, entity, target) {
          expect(target).toBe(parent);
          expect(world.query(ChildOf(parent))).toContain(entity);
          value.weight++;
        },
        onRemove: removed,
      },
    });
    const entity = world.spawn(ChildOf(parent, { weight: 2 }));
    expect(entity.get(ChildOf(parent))).toEqual({ weight: 3 });
    entity.remove(ChildOf(parent));
    expect(removed).toHaveBeenCalledWith({ weight: 3 }, entity, parent);
  });

  it('rejects recursive flush, reset, and destroy without leaving the lifecycle locked', () => {
    const A = trait(undefined, {
      onAdd() {
        expect(() => world.flush()).toThrow('during a mutation');
        expect(() => world.reset()).toThrow('Koota: Cannot reset a world during a mutation.');
        expect(() => world.destroy()).toThrow('Koota: Cannot destroy a world during a mutation.');
      },
    });
    world.add(A);
    world.remove(A);
    expect(world.has(A)).toBe(false);
  });
});
