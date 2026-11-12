import { describe, expect, it, vi } from 'vitest';
import { $internal, createChanged, createWorld, ordered, relation, trait, type Entity } from '../src';

const Position = trait({ x: 0 });
const Velocity = trait({ dx: 0 });
const Tag = trait();

describe('deferred structural changes', () => {
  it('bounds hook-generated waves and recovers without pending commands or observers', () => {
    const world = createWorld();
    const entity = world.spawn();
    const observed = vi.fn();
    const observer = world[$internal].observeSettled(observed);
    let calls = 0;
    const stopAdd = world.onAdd(Tag, (entity) => {
      observer.invalidate();
      // Keep a broken drain finite so this regression cannot hang the test runner.
      if (++calls < 200000) entity.remove(Tag);
    });
    const stopRemove = world.onRemove(Tag, (entity) => {
      if (++calls < 200000) entity.add(Tag);
    });

    expect(() => entity.add(Tag)).toThrow('did not settle after 100000 waves');
    expect(calls).toBeLessThan(200000);
    expect(observed).not.toHaveBeenCalled();
    stopAdd();
    stopRemove();

    const present = entity.has(Tag);
    world.defer(() => entity.add(Velocity));
    expect(entity.has(Tag)).toBe(present);
    expect(entity.has(Velocity)).toBe(true);
    expect(observed).not.toHaveBeenCalled();
    world.reset();
    world.destroy();
  });

  it('follows a hook chain one wave per link', () => {
    const world = createWorld();
    const entities = Array.from({ length: 500 }, () => world.spawn(Tag));
    world.onRemove(Tag, (entity) => {
      const next = entities[entities.indexOf(entity) + 1];
      if (next !== undefined) next.remove(Tag);
    });

    entities[0].remove(Tag);

    expect(world.query(Tag).length).toBe(0);
    world.destroy();
  });

  it('accepts a large initial batch within one command wave', () => {
    const world = createWorld();
    const entities = Array.from({ length: 1001 }, () => world.spawn());

    world.defer(() => {
      for (const entity of entities) entity.add(Tag);
    });

    expect(world.query(Tag).length).toBe(entities.length);
    world.destroy();
  });

  it('finishes command waves in call order before observers even when a command throws', () => {
    const world = createWorld();
    const entities = Array.from({ length: 4 }, () => world.spawn());
    const events: Entity[] = [];
    const observed: number[] = [];
    const observer = world[$internal].observeSettled(() => observed.push(world.query(Tag).length));
    world.onAdd(Tag, (entity) => {
      events.push(entity);
      observer.invalidate();
      if (entity === entities[0]) {
        entities[2].add(Tag);
        throw new Error('first wave');
      }
      if (entity === entities[2]) {
        entities[3].add(Tag);
        throw new Error('second wave');
      }
    });

    expect(() =>
      world.defer(() => {
        entities[0].add(Tag);
        entities[1].add(Tag);
      })
    ).toThrow('first wave');

    expect(events).toEqual(entities);
    expect(observed).toEqual([4]);
    world.destroy();
  });

  it.each(['set', 'upsert', 'changed'] as const)(
    'defers Changed query callback edits until every %s notification completes',
    (operation) => {
      const world = createWorld();
      const entity = world.spawn(Position);
      const First = createChanged();
      const Second = createChanged();
      const events: string[] = [];
      world.onEnter([First(Position)], () => {
        events.push('first');
        entity.remove(Position);
        expect(entity.has(Position)).toBe(true);
      });
      world.onEnter([Second(Position)], () => {
        events.push('second');
        entity.destroy();
        expect(entity.isAlive()).toBe(true);
      });
      entity.onChange(Position, () => {
        events.push('change');
        expect(entity.get(Position)?.x).toBe(operation === 'changed' ? 0 : 7);
      });
      world.query(First(Position));
      world.query(Second(Position));

      if (operation === 'changed') entity.changed(Position);
      else entity[operation](Position, { x: 7 });

      expect(events).toEqual(['first', 'second', 'change']);
      expect(entity.isAlive()).toBe(false);
      world.destroy();
    }
  );

  it('finishes relation and pair change notifications before a callback removes the pair', () => {
    const world = createWorld();
    const Link = relation({ store: { weight: 0 } });
    const target = world.spawn();
    const entity = world.spawn(Link(target));
    const Changed = createChanged();
    const events: string[] = [];
    world.onEnter([Changed(Link)], () => {
      events.push('relation');
      entity.remove(Link(target));
    });
    world.onEnter([Changed(Link(target))], () => {
      events.push('pair');
      expect(entity.has(Link(target))).toBe(true);
    });
    entity.onChange(Link, () => {
      events.push('change');
      expect(entity.get(Link(target))?.weight).toBe(3);
    });
    world.query(Changed(Link));
    world.query(Changed(Link(target)));

    entity.set(Link(target), { weight: 3 });

    expect(events).toEqual(['relation', 'pair', 'change']);
    expect(entity.has(Link(target))).toBe(false);
    world.destroy();
  });

  it('applies walk changes in call order when the outermost walk ends', () => {
    const world = createWorld();
    const a = world.spawn(Position);
    const b = world.spawn(Position);
    const c = world.spawn(Position);
    const visited: Entity[] = [];

    world.query(Position).each((position, entity) => {
      visited.push(entity);
      position.x = 1;
      if (entity !== a) return;
      b.remove(Position);
      c.destroy();
      a.add(Velocity);
      a.remove(Velocity);
      // Nothing has changed yet. Every row keeps its data and the world reads as it started.
      expect(b.has(Position)).toBe(true);
      expect(c.isAlive()).toBe(true);
      expect(a.has(Velocity)).toBe(false);
      expect(world.query(Position).length).toBe(3);
    });

    expect(visited).toEqual([a, b, c]);
    expect(b.has(Position)).toBe(false);
    expect(b.get(Position)).toBeUndefined();
    expect(c.isAlive()).toBe(false);
    expect(a.has(Velocity)).toBe(false);
    expect(a.get(Position)?.x).toBe(1);
    expect(world.query(Position).toArray()).toEqual([a]);
    world.destroy();
  });

  it('flushes only when the outermost walk ends', () => {
    const world = createWorld();
    const a = world.spawn(Position, Tag);
    const b = world.spawn(Position, Tag);

    world.query(Position).forEach((entity) => {
      world.query(Tag).each((tagged) => {
        if (tagged === entity) tagged.remove(Tag);
      });
      // The nested walk ended, but the outer one still holds the scope.
      expect(entity.has(Tag)).toBe(true);
    });
    expect(a.has(Tag)).toBe(false);
    expect(b.has(Tag)).toBe(false);
    world.destroy();
  });

  it('spawns immediately inside a walk and visits the new entity on the next run', () => {
    const world = createWorld();
    const parent = world.spawn(Position({ x: 5 }));
    let child!: Entity;

    world.query(Position).each((position, entity) => {
      if (entity !== parent) return;
      child = world.spawn(Position({ x: position.x + 1 }));
      child.set(Position, { x: 9 });
      expect(child.has(Position)).toBe(true);
      expect(world.query(Position).length).toBe(2);
    });

    expect(child.get(Position)?.x).toBe(9);
    expect(world.query(Position).toArray()).toEqual([parent, child]);
    world.destroy();
  });

  it('applies changes made inside for...of at once while the loop keeps its starting sequence', () => {
    const world = createWorld();
    const a = world.spawn(Position);
    const b = world.spawn(Position);
    const c = world.spawn(Position);
    const visited: Entity[] = [];

    for (const entity of world.query(Position)) {
      visited.push(entity);
      if (entity !== a) continue;
      a.remove(Position);
      b.destroy();
      expect(a.has(Position)).toBe(false);
      expect(b.isAlive()).toBe(false);
      expect(world.query(Position).toArray()).toEqual([c]);
    }

    expect(visited).toEqual([a, b, c]);
    world.destroy();
  });

  it('defers changes made inside for...of when world.defer wraps the loop', () => {
    const world = createWorld();
    world.spawn(Position);
    world.spawn(Position);

    world.defer(() => {
      for (const entity of world.query(Position)) {
        entity.remove(Position);
        expect(entity.has(Position)).toBe(true);
      }
    });

    expect(world.query(Position).length).toBe(0);
    world.destroy();
  });

  it('leaves the world unaffected by an iterator that never finishes', () => {
    const world = createWorld();
    const a = world.spawn(Position);
    const b = world.spawn(Position);
    const iterator = world.query(Position)[Symbol.iterator]();
    expect(iterator.next().value).toBe(a);

    a.remove(Position);
    expect(a.has(Position)).toBe(false);
    expect(world.query(Position).toArray()).toEqual([b]);
    world.query(Position).each((_position, entity) => {
      entity.remove(Position);
      expect(entity.has(Position)).toBe(true);
    });
    expect(world.query(Position).length).toBe(0);
    // The abandoned iterator still reads the sequence it started with.
    expect(iterator.next().value).toBe(b);
    world.reset();
    world.destroy();
  });

  it('runs a function with structural changes deferred through world.defer', () => {
    const world = createWorld();
    const entities = [world.spawn(Position), world.spawn(Position), world.spawn(Position)];
    const dense = world.query(Position).entities;

    const result = world.defer(() => {
      for (let i = 0; i < dense.length; i++) {
        dense[i].destroy();
        expect(dense[i].isAlive()).toBe(true);
      }
      return dense.length;
    });

    expect(result).toBe(3);
    expect(entities.every((entity) => !entity.isAlive())).toBe(true);
    expect(world.query(Position).length).toBe(0);
    world.destroy();
  });

  it('defers changes made by hooks until the operation that reached them completes', () => {
    const world = createWorld();
    const Link = relation();
    const a = world.spawn();
    const b = world.spawn();
    const source = world.spawn(Link(a), Link(b));
    const seen: (Entity | undefined)[] = [];

    // A relation remove hook that removes another pair, the Flecs observer pattern.
    source.onRemove(Link, (_, target) => {
      seen.push(target as Entity);
      if (target !== a) return;
      source.remove(Link(b));
      // The hook's removal waits for the one that reached it to complete.
      expect(source.has(Link(b))).toBe(true);
      expect(source.targetsFor(Link)).toEqual([a, b]);
    });

    source.remove(Link(a));
    expect(seen).toEqual([a, b]);
    expect(source.targetsFor(Link)).toEqual([]);
    world.destroy();
  });

  it('defers a removal made by an onAdd hook and a destroy made by an onChange hook', () => {
    const world = createWorld();
    const entity = world.spawn();
    entity.onAdd(Velocity, () => {
      entity.remove(Position);
      expect(entity.has(Position)).toBe(true);
    });

    entity.add(Position, Velocity);
    expect(entity.has(Position)).toBe(false);
    expect(entity.has(Velocity)).toBe(true);

    const other = world.spawn(Position);
    other.onChange(Position, () => other.destroy());
    other.set(Position, { x: 2 });
    expect(other.isAlive()).toBe(false);
    world.destroy();
  });

  it('drops deferred commands for an entity destroyed earlier in the log', () => {
    const world = createWorld();
    const entity = world.spawn(Position);
    const added = vi.fn();
    world.onAdd(Velocity, added);

    world.defer(() => {
      entity.destroy();
      entity.add(Velocity);
      entity.remove(Position);
    });

    expect(entity.isAlive()).toBe(false);
    expect(added).not.toHaveBeenCalled();
    world.destroy();
  });

  it('applies every command even when one throws, then rethrows the first error', () => {
    const world = createWorld();
    const a = world.spawn();
    const b = world.spawn();
    world.onAdd(Tag, (entity) => {
      if (entity === a) throw new Error('hook failed');
    });

    expect(() =>
      world.defer(() => {
        a.add(Tag);
        b.add(Tag);
      })
    ).toThrow('hook failed');
    expect(a.has(Tag)).toBe(true);
    expect(b.has(Tag)).toBe(true);
    world.destroy();
  });

  it('keeps commands added by hooks during the flush in the same drain', () => {
    const world = createWorld();
    const entities = [world.spawn(Position), world.spawn(Position)];
    world.onRemove(Position, (entity) => entity.add(Tag));

    world.query(Position).each((_, entity) => entity.remove(Position));

    for (const entity of entities) {
      expect(entity.has(Position)).toBe(false);
      expect(entity.has(Tag)).toBe(true);
    }
    world.destroy();
  });

  it('defers ordered view edits made inside a scope as whole commands', () => {
    const world = createWorld();
    const ChildOf = relation();
    const Children = ordered(ChildOf);
    const parent = world.spawn(Children);
    const first = world.spawn();
    const second = world.spawn();
    const third = world.spawn();
    const view = parent.get(Children)!;
    view.add(first).add(second);

    world.defer(() => {
      view.insert(third, 0);
      view.remove(first);
      expect(view.toArray()).toEqual([first, second]);
    });

    // The insert kept its index even though it applied after the scope ended.
    expect(view.toArray()).toEqual([third, second]);
    expect(first.has(ChildOf(parent))).toBe(false);
    expect(third.has(ChildOf(parent))).toBe(true);
    world.destroy();
  });

  it('refuses to reset or destroy the world inside a scope', () => {
    const world = createWorld();
    world.spawn(Position);
    expect(() => world.defer(() => world.reset())).toThrow(/DEFER_SCOPE/);
    world.query(Position).each(() => {
      expect(() => world.destroy()).toThrow(/DEFER_SCOPE/);
    });
    expect(world.isRegistered).toBe(true);
    world.destroy();
  });

  it('defers upsert as a whole so the last upsert wins and a pending removal is honored', () => {
    const world = createWorld();
    const fresh = world.spawn();
    const present = world.spawn(Position({ x: 1 }));

    world.defer(() => {
      fresh.upsert(Position, { x: 1 });
      fresh.upsert(Position, { x: 2 });
      present.remove(Position);
      present.upsert(Position, { x: 7 });
      expect(fresh.has(Position)).toBe(false);
      expect(present.get(Position)?.x).toBe(1);
    });

    expect(fresh.get(Position)?.x).toBe(2);
    expect(present.get(Position)?.x).toBe(7);
    world.destroy();
  });

  it('drops a deferred pair add whose target died earlier in the log', () => {
    const world = createWorld();
    const Link = relation();
    const source = world.spawn();
    const target = world.spawn();

    // With assertions on the apply throws, with them off the pair is dropped. Either way the
    // target id is free for the next spawn without an incoming pair.
    expect(() =>
      world.defer(() => {
        target.destroy();
        source.add(Link(target));
      })
    ).toThrow(/ENTITY_ALIVE/);
    expect(source.targetsFor(Link)).toEqual([]);
    const recycled = world.spawn();
    expect(world.query(Link(recycled)).length).toBe(0);
    world.destroy();
  });

  it('drops changes that teardown hooks log during a reset', () => {
    const world = createWorld();
    const Config = trait({ ready: false });
    world.add(Config);
    // The world entity is still alive while its own traits leave, so the add is logged. The new
    // world entity is a different handle, so the dead entity rule drops the command.
    world.onRemove(Config, () => world.add(Tag));

    world.reset();
    expect(world.has(Tag)).toBe(false);
    expect(world.isRegistered).toBe(true);
    world.destroy();
  });

  it('drains both queues when a command throws, so observers still run', () => {
    const world = createWorld();
    const a = world.spawn();
    const b = world.spawn();
    const observed: number[] = [];
    const observer = world[$internal].observeSettled(() => {
      observed.push(world.query(Tag).length);
    });
    world.onAdd(Tag, (entity) => {
      observer.invalidate();
      if (entity === a) throw new Error('hook failed');
    });

    expect(() =>
      world.defer(() => {
        a.add(Tag);
        b.add(Tag);
      })
    ).toThrow('hook failed');
    expect(observed).toEqual([2]);
    // Nothing was left behind for the next operation.
    world.spawn(Position);
    expect(observed).toEqual([2]);
    world.destroy();
  });
});
