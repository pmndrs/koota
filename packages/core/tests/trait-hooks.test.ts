import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createChanged, createWorld, relation, trait, type Entity, type World } from '../src';

describe('Trait hooks', () => {
  let world: World;
  beforeEach(() => {
    world = createWorld();
  });
  afterEach(() => {
    world.destroy();
  });

  it('runs add hooks on constructed defaults, then applies supplied values as a set', () => {
    const order: string[] = [];
    const Position = trait({ x: 0, y: 1 })
      .onAdd((value, entity) => {
        expect(value).toEqual({ x: 0, y: 1 });
        expect(world.query(Position)).toContain(entity);
        value.y = 5;
        order.push('add');
      })
      .onSet((value) => {
        expect(value).toEqual({ x: 3, y: 5 });
        value.x *= 2;
        order.push('set');
      });
    world.onQueryAdd([Position], (entity) => {
      expect(entity.get(Position)).toEqual({ x: 6, y: 5 });
      order.push('query');
    });
    world.onAdd(Position, (entity) => {
      expect(entity.get(Position)).toEqual({ x: 6, y: 5 });
      order.push('observer');
    });
    world.onChange(Position, (entity) => {
      expect(entity.get(Position)).toEqual({ x: 6, y: 5 });
      order.push('change');
    });
    const entity = world.spawn(Position({ x: 3 }));
    expect(entity.get(Position)).toEqual({ x: 6, y: 5 });
    expect(order).toEqual(['add', 'set', 'observer', 'query', 'change']);
  });

  it('counts a value supplied at add time as a change', () => {
    const Changed = createChanged();
    const Position = trait({ x: 0 });
    const withValue = world.spawn(Position({ x: 1 }));
    const withoutValue = world.spawn(Position);
    const changed = world.query(Changed(Position));
    expect(changed).toContain(withValue);
    expect(changed).not.toContain(withoutValue);
  });

  it('runs remove observers and hooks while the departing value remains accessible', () => {
    const order: string[] = [];
    const Position = trait({ x: 0 }).onRemove((value, entity) => {
      expect(value.x).toBe(3);
      expect(entity.has(Position)).toBe(true);
      order.push('hook');
    });
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

  it('runs remove hooks when the entity is destroyed', () => {
    const removed = vi.fn();
    const Position = trait({ x: 0 }).onRemove(removed);
    const Tag = trait().onRemove(removed);
    const entity = world.spawn(Position({ x: 4 }), Tag);
    entity.destroy();
    expect(removed).toHaveBeenCalledTimes(2);
    expect(removed).toHaveBeenCalledWith({ x: 4 }, entity);
  });

  it('runs set hooks before change observers and detects writes in updateEach', () => {
    const hook = vi.fn((value: { x: number }) => {
      value.x = Math.max(0, value.x);
    });
    const Position = trait({ x: 0 }).onSet(hook);
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

  it('leaves the previous value in place when a set hook throws', () => {
    const Position = trait({ x: 0 }).onSet((value) => {
      if (value.x < 0) throw new Error('negative');
    });
    const entity = world.spawn(Position({ x: 1 }));
    expect(() => entity.set(Position, { x: -1 })).toThrow('negative');
    expect(entity.get(Position)).toEqual({ x: 1 });
  });

  it('detects updateEach writes when a set hook is the only listener', () => {
    const hook = vi.fn();
    const Position = trait({ x: 0 }).onSet(hook);
    world.spawn(Position);
    world.query(Position).updateEach(([position]) => {
      position.x = 1;
    });
    expect(hook).toHaveBeenCalledOnce();
  });

  it('finishes the current lifecycle before applying mutations requested by hooks', () => {
    const order: string[] = [];
    const B = trait().onAdd(() => {
      order.push('b');
    });
    const A = trait().onAdd((_value, entity) => {
      order.push('a');
      entity.add(B);
      expect(entity.has(B)).toBe(false);
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
    const Resource = trait(() => ({ items: [] as string[] })).onAdd(onAdd);
    const entity = world.spawn(Resource);
    entity.add(Resource);
    expect(onAdd).toHaveBeenCalledOnce();
    expect(entity.get(Resource)!.items).toEqual(['ready']);
  });

  it('uses a supplied instance instead of the factory and passes it through the set hook', () => {
    const factory = vi.fn(() => ({ id: 'made' }));
    const seen: string[] = [];
    const Resource = trait(factory)
      .onAdd((value) => seen.push(`add:${value.id}`))
      .onSet((value) => seen.push(`set:${value.id}`));
    const supplied = { id: 'given' };
    const entity = world.spawn(Resource(supplied));
    expect(factory).not.toHaveBeenCalled();
    expect(entity.get(Resource)).toBe(supplied);
    expect(seen).toEqual(['add:given', 'set:given']);
  });

  it('passes the entity to factories that declare a parameter', () => {
    const Owner = trait({ self: (entity: Entity) => entity, count: () => 0 });
    const entity = world.spawn(Owner);
    expect(entity.get(Owner)).toEqual({ self: entity, count: 0 });
    const Handle = trait((entity: Entity) => ({ entity }));
    const other = world.spawn(Handle);
    expect(other.get(Handle)!.entity).toBe(other);
  });

  it('queues structural and data operations requested by a hook', () => {
    const Position = trait({ x: 0 });
    const Tag = trait();
    const entity = world.spawn(Position, Tag);
    const discarded = world.spawn();
    const changed = vi.fn();
    world.onChange(Position, changed);
    const Trigger = trait().onAdd(() => {
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
    const Position = trait({ x: 0 }).onSet(onSet);
    const entity = world.spawn(Position);
    world.onChange(Position, observer);
    entity.set(Position, { x: 2 }, false);
    expect(onSet).toHaveBeenCalledOnce();
    expect(observer).not.toHaveBeenCalled();
  });

  it('provides relation hooks with pair data and the target', () => {
    const parent = world.spawn();
    const removed = vi.fn();
    const ChildOf = relation({ store: { weight: 0 } })
      .onAdd((value, entity, target) => {
        expect(target).toBe(parent);
        expect(world.query(ChildOf(parent))).toContain(entity);
        expect(value).toEqual({ weight: 0 });
        value.weight++;
      })
      .onSet((value) => {
        value.weight++;
      })
      .onRemove(removed);
    const entity = world.spawn(ChildOf(parent, { weight: 2 }));
    expect(entity.get(ChildOf(parent))).toEqual({ weight: 3 });
    entity.remove(ChildOf(parent));
    expect(removed).toHaveBeenCalledWith({ weight: 3 }, entity, parent);
  });

  it('runs target destroy hooks per source before the pair is removed', () => {
    const parent = world.spawn();
    const seen: string[] = [];
    const ChildOf = relation({ store: { order: 0 } })
      .onTargetDestroy((value, child, target) => {
        expect(target).toBe(parent);
        expect(target.isAlive()).toBe(true);
        expect(child.has(ChildOf(parent))).toBe(true);
        seen.push(`target:${value.order}`);
      })
      .onRemove((value) => {
        seen.push(`remove:${value.order}`);
      });
    const a = world.spawn(ChildOf(parent, { order: 1 }));
    const b = world.spawn(ChildOf(parent, { order: 2 }));
    parent.destroy();
    expect(seen).toEqual(['target:2', 'remove:2', 'target:1', 'remove:1']);
    expect(a.has(ChildOf('*'))).toBe(false);
    expect(b.isAlive()).toBe(true);
  });

  it('lets a target destroy hook cascade to the source', () => {
    const parent = world.spawn();
    const ChildOf = relation().onTargetDestroy((_value, child) => {
      child.destroy();
    });
    const child = world.spawn(ChildOf(parent));
    parent.destroy();
    expect(child.isAlive()).toBe(false);
  });

  it('rejects hooks installed twice or after the trait is used', () => {
    const Position = trait({ x: 0 }).onSet(() => {});
    expect(() => Position.onSet(() => {})).toThrow('already has an onSet hook');
    const Used = trait({ x: 0 });
    world.spawn(Used);
    expect(() => Used.onAdd(() => {})).toThrow('before the trait is used');
  });

  it('rejects recursive flush, reset, and destroy without leaving the lifecycle locked', () => {
    const A = trait().onAdd(() => {
      expect(() => world.flush()).toThrow('during a mutation');
      expect(() => world.reset()).toThrow('Koota: Cannot reset a world during a mutation.');
      expect(() => world.destroy()).toThrow('Koota: Cannot destroy a world during a mutation.');
    });
    world.add(A);
    world.remove(A);
    expect(world.has(A)).toBe(false);
  });
});
