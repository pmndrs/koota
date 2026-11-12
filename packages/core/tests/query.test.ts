import { beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest';
import {
  $internal,
  createAdded,
  createChanged,
  createQuery,
  createRemoved,
  createWorld,
  IsExcluded,
  Not,
  Or,
  relation,
  trait,
  type Entity,
} from '../src';
import { hasNativeGc, waitForFinalization } from './utils/gc';

const Position = trait({ x: 0, y: 0 });
const Name = trait({ name: 'name' });
const IsActive = trait();
const IsPlayer = trait();
const Foo = trait();
const Bar = trait();
const ChildOf = relation();

describe('Query', () => {
  const world = createWorld();

  beforeEach(() => {
    world.reset();
  });

  it.skipIf(!hasNativeGc()).each(['first', 'last'] as const)(
    'releases a dynamic trait in the %s query position after resetting the world',
    async (position) => {
      await expect(
        waitForFinalization((registry) => {
          const Dynamic = trait({ value: 0 });
          world.spawn(Position, Dynamic);
          const query =
            position === 'first' ? world.query(Dynamic, Position) : world.query(Position, Dynamic);
          query.each(() => {});
          registry.register(Dynamic, 'trait');
          world.reset();
        })
      ).resolves.toBe(true);
    },
    20_000
  );

  it('should query entities that match the parameters', () => {
    const entityA = world.spawn();
    const entityB = world.spawn();
    const entityC = world.spawn();

    entityA.add(Position, Name, IsActive);
    entityB.add(Position, Name);
    entityC.add(Position);

    let entities: any = world.query(Position, Name, IsActive);
    expect(entities.first!).toBe(entityA);

    entities = world.query(Position, Name);
    expect(entities.first!).toBe(entityA);
    expect(entities.at(1)).toBe(entityB);

    entities = world.query(Position);
    expect(entities.first!).toBe(entityA);
    expect(entities.at(1)).toBe(entityB);
    expect(entities.at(2)).toBe(entityC);

    entityA.remove(IsActive);
    entities = world.query(Position, Name, IsActive);
    expect(entities.length).toBe(0);
  });

  it('keeps retained entities distinct from new spawns until eviction', () => {
    const world = createWorld({ retain: 2 });
    const Removed = createRemoved();
    world.query(Removed(Position));
    const first = world.spawn(Position);
    world.query(Position);

    first.destroy();
    const second = world.spawn(Position);
    second.destroy();
    const replacement = world.spawn(Position);

    expect(replacement.id()).not.toBe(first.id());
    expect(replacement.id()).not.toBe(second.id());
    expect(Array.from(world.query(Position))).toEqual([replacement]);
    expect(Array.from(world.query(Removed(Position)))).toEqual([first, second]);
    expect(world.query(Removed(Position)).length).toBe(0);
    world.spawn().destroy();
    expect(world.spawn(Position).id()).toBe(first.id());
  });

  it('should only create one hash indpendent of the order of the parameters', () => {
    const ctx = world[$internal];
    let entities: any = world.query(Position, Name, Not(IsActive));
    expect(entities.length).toBe(0);

    const entA = world.spawn();
    entA.add(Position, Name);

    entities = world.query(Position, Name, Not(IsActive));
    expect(entities.length).toBe(1);

    entities = world.query(Name, Not(IsActive), Position);
    expect(entities.length).toBe(1);

    expect(ctx.queriesHashMap.size).toBe(1);

    // Test various permutations of modifiers.
    entities = world.query(IsActive, Not(Position, Name));
    expect(entities.length).toBe(0);

    expect(ctx.queriesHashMap.size).toBe(2);

    entities = world.query(Not(Name, Position), IsActive);
    expect(entities.length).toBe(0);

    entities = world.query(Not(Position), IsActive, Not(Name));
    expect(entities.length).toBe(0);

    expect(ctx.queriesHashMap.size).toBe(2);
  });

  it('should return all queryable entities when parameters are empty', () => {
    world.spawn();
    // IsExcluded marks the entity is non-queryable.
    world.spawn(IsExcluded);
    world.spawn(Position);
    world.spawn(Name, Bar);
    const entities = world.query();

    expect(entities.length).toBe(3);
  });

  it('can cache and use the query key', () => {
    const key = createQuery(Position, Name, IsActive);

    const entityA = world.spawn();
    const entityB = world.spawn();

    entityA.add(Position, Name, IsActive);
    entityB.add(Position, Name);

    const entities = world.query(key);

    expect(entities).toContain(entityA);

    // Check that a query result is returned.
    expect(entities).toHaveProperty('each');

    // Test caching before a world is created.
    const world2 = createWorld();
    const entityC = world2.spawn(Position, Name, IsActive);
    const query2 = world2.query(key);

    expect(query2).toContain(entityC);
  });

  it('should exclude entities with IsExcluded', () => {
    world.spawn(Position, IsExcluded);
    const entities = world.query(Position);
    expect(entities.length).toBe(0);
  });

  it('skips pending changes for a trait removed during each', () => {
    const first = world.spawn(Position);
    const second = world.spawn(Position);
    const changed = vi.fn();
    world.onChange(Position, changed);

    world.query(Position).each((position, current) => {
      position.x++;
      if (current === second) first.remove(Position);
    });

    expect(changed).toHaveBeenCalledExactlyOnceWith(second);
    expect(first.has(Position)).toBe(false);
  });

  it('skips pending changes for an entity recycled during each', () => {
    const first = world.spawn(Position);
    const second = world.spawn(Position);
    let replacement = first;
    const changed = vi.fn();
    world.onChange(Position, changed);

    world.query(Position).each((position, current) => {
      position.x++;
      if (current === second) {
        first.destroy();
        replacement = world.spawn(Position({ x: 7 }));
      }
    });

    expect(changed.mock.calls).toEqual([[replacement], [second]]);
    expect(replacement.get(Position)?.x).toBe(7);
  });

  it('keeps Removed query history available after destroying an entity', () => {
    const Removed = createRemoved();
    const entity = world.spawn(Position({ x: 7 }));
    world.query(Removed(Position));
    entity.destroy();
    let historical = 0;
    world.query(Removed(Position)).each((position) => {
      historical = position.x;
    });
    expect(historical).toBe(7);
  });

  it('keeps caller-owned tuple replacements separate during each', () => {
    const Transform = trait({ position: [0, 0, 0], mass: 1 });
    const first = world.spawn(Transform({ position: [1, 2, 3], mass: 1 }));
    const second = world.spawn(Transform({ position: [4, 5, 6], mass: 2 }));
    const replacement: [number, number, number] = [7, 8, 9];
    const seen: number[][] = [];
    const query = world.query(Transform);

    for (let pass = 0; pass < 2; pass++) {
      query.each((transform) => {
        seen.push([...transform.position]);
        transform.position = replacement;
        transform.mass = 10;
      });
      expect(replacement).toEqual([7, 8, 9]);
    }

    expect(seen).toEqual([[1, 2, 3], [4, 5, 6], replacement, replacement]);
    expect(first.get(Transform)).toEqual({ position: replacement, mass: 10 });
    expect(second.get(Transform)).toEqual({ position: replacement, mass: 10 });
  });

  it('keeps outer callback data intact during nested each iteration', () => {
    const first = world.spawn(Position({ x: 1 }));
    const second = world.spawn(Position({ x: 2 }));
    const query = world.query(Position);

    for (let pass = 0; pass < 2; pass++) {
      query.each((position) => {
        const x = position.x;
        query.each(() => {});
        expect(position.x).toBe(x);
        position.x++;
      });
    }

    expect(first.get(Position)!.x).toBe(3);
    expect(second.get(Position)!.x).toBe(4);
  });

  it('can iterate again after a callback throws', () => {
    const entity = world.spawn(Position({ x: 1 }));
    const query = world.query(Position);
    expect(() =>
      query.each((position) => {
        position.x = 100;
        throw new Error('stop');
      })
    ).toThrow('stop');

    // Cursor writes land as they happen, so the write before the throw is kept.
    query.each((position) => position.x++);
    expect(entity.get(Position)).toEqual({ x: 101, y: 0 });
  });

  it('each visits entities of a tag-only query', () => {
    const first = world.spawn(IsPlayer);
    const second = world.spawn(IsPlayer);
    const visited: Entity[] = [];

    world.query(IsPlayer).each((entity) => visited.push(entity));

    expect(visited).toEqual([first, second]);
  });

  it('each should return values in caller parameter order regardless of cache', () => {
    // Create entity with both traits
    world.spawn(Position({ x: 10, y: 20 }), Name({ name: 'test' }));

    // First query with order: Position, Name
    world.query(Position, Name).each((position, name) => {
      expect(position).toHaveProperty('x');
      expect(position).toHaveProperty('y');
      expect(name).toHaveProperty('name');
      expect(name.name).toBe('test');
    });

    // Second query with REVERSED order: Name, Position
    // This should return values in the order specified (Name first, Position second)
    world.query(Name, Position).each((name, position) => {
      expect(name).toHaveProperty('name', 'test');
      expect(position).toHaveProperty('x');
      expect(position).toHaveProperty('y');
    });
  });

  it('should return the first entity in a query', () => {
    const entityA = world.spawn(Position);

    const entity = world.queryFirst(Position);
    expect(entity).toBe(entityA);
  });

  it('should implement Or', () => {
    const entityA = world.spawn(Position);
    const entityB = world.spawn(Foo);
    const entityC = world.spawn(Bar);

    const entities = world.query(Or(Position, Foo));

    expect(entities).toContain(entityA);
    expect(entities).toContain(entityB);
    expect(entities).not.toContain(entityC);
  });

  it('can filter relation targets with query parameters', () => {
    const parentA = world.spawn(IsPlayer, IsActive);
    const parentB = world.spawn(IsPlayer);
    const parentC = world.spawn(IsActive);

    const childA = world.spawn(ChildOf(parentA));
    const childB = world.spawn(ChildOf(parentB));
    const childC = world.spawn(ChildOf(parentC));

    expect(Array.from(world.query(ChildOf(IsPlayer)))).toEqual([childA, childB]);
    expect(world.query(ChildOf(IsPlayer, IsActive))).toContain(childA);
    expect(world.query(ChildOf(IsActive, IsPlayer))).toContain(childA);

    // Works with a cached query
    const playerAndActive = createQuery(IsPlayer, IsActive);
    expect(world.query(ChildOf(playerAndActive))).toContain(childA);
    expect(world.query(ChildOf(IsPlayer))).not.toContain(childC);
  });

  it('keeps concrete, wildcard and cached target queries distinct', () => {
    const parent = world.spawn(IsPlayer);
    const other = world.spawn();
    const first = world.spawn(Position, ChildOf(parent));
    const second = world.spawn(Position, ChildOf(other));
    const concrete = createQuery(Position, ChildOf(parent));
    const wildcard = createQuery(Position, ChildOf('*'));
    const filtered = createQuery(Position, ChildOf(createQuery(IsPlayer)));

    expect([...world.query(concrete)]).toEqual([first]);
    expect([...world.query(wildcard)]).toEqual([first, second]);
    expect([...world.query(filtered)]).toEqual([first]);
  });

  it('updates relation target filters when target query membership changes', () => {
    const onAdd = vi.fn();
    const onRemove = vi.fn();

    const parent = world.spawn();
    const child = world.spawn(ChildOf(parent));

    world.onEnter([ChildOf(IsPlayer)], onAdd);
    world.onExit([ChildOf(IsPlayer)], onRemove);

    expect(world.query(ChildOf(IsPlayer))).toHaveLength(0);

    parent.add(IsPlayer);
    expect(world.query(ChildOf(IsPlayer))).toContain(child);
    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(onAdd).toHaveBeenCalledWith(child);

    parent.remove(IsPlayer);
    expect(world.query(ChildOf(IsPlayer))).toHaveLength(0);
    expect(onRemove).toHaveBeenCalledTimes(1);
    expect(onRemove).toHaveBeenCalledWith(child);
  });

  it('keeps queries distinct when they share a relation filter', () => {
    const parent = world.spawn(IsPlayer, IsActive);
    const positioned = world.spawn(Position, ChildOf(parent));
    const named = world.spawn(Name, ChildOf(parent));

    // Parameters listed before a relation filter have to survive into the query hash,
    // otherwise these two queries share a cache entry and the second returns the first's
    // entities.
    expect(Array.from(world.query(Position, ChildOf(IsPlayer)))).toEqual([positioned]);
    expect(Array.from(world.query(Name, ChildOf(IsPlayer)))).toEqual([named]);

    // The same holds when the filter itself takes several parameters.
    expect(Array.from(world.query(Position, ChildOf(IsPlayer, IsActive)))).toEqual([positioned]);
    expect(Array.from(world.query(Name, ChildOf(IsPlayer, IsActive)))).toEqual([named]);
  });

  it('should select traits', () => {
    world.spawn(Position, Name);

    let results = world.query(Position, Name);
    // Default should be the same as the query.
    results.each((position, name) => {
      expect(position.x).toBeDefined();
      expect(name.name).toBeDefined();
    });

    // Select only Name. The selection leaves the result itself bound to every trait.
    const selection = results.select(Name);
    selection.each((name) => {
      expect(name.name).toBeDefined();
    });
    expect(results.select(Name)).toBe(selection);

    results = world.query(Position, Name);
    results.each((position, name) => {
      expect(position.x).toBeDefined();
      expect(name.name).toBeDefined();
    });
  });

  it('each tracks mixed atomic traits when subscriptions change between calls', () => {
    const Position = trait(() => ({ x: 0 }));
    const Velocity = trait(() => ({ x: 0 }));
    const positionChanged = vi.fn();
    const velocityChanged = vi.fn();
    const entity = world.spawn(Position, Velocity);
    world.onChange(Position, positionChanged);
    const query = world.query(Velocity, Position);

    query.each((velocity, position) => {
      velocity.x++;
      position.x++;
    });

    expect(entity.get(Position)).toEqual({ x: 1 });
    expect(entity.get(Velocity)).toEqual({ x: 1 });
    expect(positionChanged).toHaveBeenCalledExactlyOnceWith(entity);

    world.onChange(Velocity, velocityChanged);
    query.each((velocity, position) => {
      velocity.x++;
      position.x++;
    });

    expect(entity.get(Position)).toEqual({ x: 2 });
    expect(entity.get(Velocity)).toEqual({ x: 2 });
    expect(positionChanged).toHaveBeenCalledTimes(2);
    expect(velocityChanged).toHaveBeenCalledExactlyOnceWith(entity);

    query.each(() => {});
    expect(positionChanged).toHaveBeenCalledTimes(2);
    expect(velocityChanged).toHaveBeenCalledTimes(1);
  });

  it('each detects changes for observers added after an untracked walk', () => {
    const Changed = createChanged();
    const entity = world.spawn(Position);
    const query = world.query(Position);
    const move = () => query.each((position) => position.x++);
    move();

    const worldChanged = vi.fn();
    const unsubscribe = world.onChange(Position, worldChanged);
    move();
    expect(worldChanged).toHaveBeenCalledExactlyOnceWith(entity);
    unsubscribe();
    move();

    const entityChanged = vi.fn();
    entity.onChange(Position, entityChanged);
    move();
    expect(entityChanged).toHaveBeenCalledExactlyOnceWith(entity);
    expect(worldChanged).toHaveBeenCalledTimes(1);

    const other = world.spawn(Name);
    const names = world.query(Name);
    const rename = () => names.each((name) => (name.name = `${name.name}!`));
    rename();
    // Registering reports the current members once.
    world.query(Changed(Name));
    expect(world.query(Changed(Name)).length).toBe(0);
    rename();
    expect(world.query(Changed(Name)).toArray()).toEqual([other]);
  });

  it('each passes each trait as an argument followed by the entity and index', () => {
    const Tags = trait(() => ({ list: [] as string[] }));
    const first = world.spawn(Position({ x: 1 }), Tags);
    const second = world.spawn(Position({ x: 2 }), Tags);
    const changed = vi.fn();
    world.onChange(Position, changed);

    world.query(Position, Tags).each((position, tags, entity, index) => {
      position.x += 10;
      tags.list.push(String(index));
      expect(entity).toBe(index === 0 ? first : second);
    });

    expect(first.get(Position)!.x).toBe(11);
    expect(second.get(Tags)!.list).toEqual(['1']);
    expect(changed).toHaveBeenCalledTimes(2);
  });

  it('should get all queryable entities from an emtpy query', () => {
    let entities = world.query();
    expect(entities.length).toBe(0);

    world.spawn(Position);
    world.spawn(Name);
    world.spawn(IsExcluded);

    entities = world.query();
    expect(entities.length).toBe(2);

    for (const entity of entities) entity.destroy();

    entities = world.query();
    expect(entities.length).toBe(0);
  });

  it('can sort query results', () => {
    const world = createWorld({ retain: 0 });
    const entityA = world.spawn(Position);
    const entityB = world.spawn(Position);
    const entityC = world.spawn(Position);
    const entityD = world.spawn(Position);

    let entities = world.query(Position);
    expect(entities.first!).toBe(entityA);
    expect(entities.at(1)).toBe(entityB);
    expect(entities.at(2)).toBe(entityC);
    expect(entities.at(3)).toBe(entityD);

    entityC.destroy();

    entities = world.query(Position);
    expect(entities.first!).toBe(entityA);
    expect(entities.at(1)).toBe(entityB);
    expect(entities.at(2)).toBe(entityD);

    // Recycles the entity id from entityC (3).
    const entityE = world.spawn(Position);

    entities = world.query(Position);
    expect(entities.first!).toBe(entityA);
    expect(entities.at(1)).toBe(entityB);
    expect(entities.at(2)).toBe(entityD);
    expect(entities.at(3)).toBe(entityE);

    // Sorting a copy leaves the live view in the query's order.
    const sorted = entities.toArray().sort((a, b) => a.id() - b.id());
    expect(sorted).not.toBe(entities);
    expect(entities.at(2)).toBe(entityD);

    // The ids are consecutive in ascending order once entityE has recycled entityC's id.
    for (let i = 0; i < sorted.length; i++) {
      expect(sorted[i].id()).toBe(sorted[0].id() + i);
    }
  });

  it('cached query should return values after reset', () => {
    const movementQuery = createQuery(Foo);

    const spawnEntities = () => {
      for (let i = 0; i < 100; i++) {
        world.spawn(Foo);
      }
    };

    spawnEntities();
    const countBefore = world.query(movementQuery).length;

    world.reset();
    spawnEntities();

    expect(world.query(movementQuery).length).toBe(countBefore);
  });

  it('passes traits in the order each inline query lists them', () => {
    world.spawn(Position({ x: 1, y: 2 }), Name({ name: 'first' }));

    // The second pass resolves both orders from parameters seen before.
    for (let pass = 0; pass < 2; pass++) {
      world.query(Position, Name, Not(Foo)).each((position, name) => {
        expect(position).toMatchObject({ x: 1, y: 2 });
        expect(name).toMatchObject({ name: 'first' });
      });
      world.query(Name, Position, Not(Foo)).each((name, position) => {
        expect(name).toMatchObject({ name: 'first' });
        expect(position).toMatchObject({ x: 1, y: 2 });
      });
    }
  });

  it('resolves a repeated inline query that names a target entity', () => {
    const parent = world.spawn();
    const other = world.spawn();
    const child = world.spawn(Position, ChildOf(parent));
    const otherChild = world.spawn(Position, ChildOf(other));

    // Each call builds a new pair, and the later ones find the query of the first.
    const result = world.query(Position, ChildOf(parent));
    expect(world.query(Position, ChildOf(parent))).toBe(result);
    expect(result.toArray()).toEqual([child]);
    expect(world.query(Position, ChildOf(other)).toArray()).toEqual([otherChild]);

    // A destroyed parent takes its query with it, and the other parent keeps its own.
    parent.destroy();
    const late = world.spawn(Position, ChildOf(other));
    expect(world.query(Position, ChildOf(other)).toArray()).toEqual([otherChild, late]);
  });

  it('keeps cached multi-target queries current as relations and targets change', () => {
    const VisibleIn = relation();
    const parent = world.spawn();
    let viewport = world.spawn();
    const child = world.spawn(Position, ChildOf(parent), VisibleIn(viewport));
    const prefix = world.query(ChildOf(parent), Position);
    const read = () => world.query(ChildOf(parent), VisibleIn(viewport), Position);
    const view = read();
    expect(read()).toBe(view);
    expect(view.toArray()).toEqual([child]);

    child.remove(VisibleIn(viewport));
    expect(read()).toHaveLength(0);
    child.add(VisibleIn(viewport));
    expect(read().toArray()).toEqual([child]);

    viewport.destroy();
    expect(read()).toHaveLength(0);
    expect(world.query(ChildOf(parent), Position)).toBe(prefix);
    expect(prefix.toArray()).toEqual([child]);

    viewport = world.spawn();
    child.add(VisibleIn(viewport));
    expect(read().toArray()).toEqual([child]);
  });

  it('returns the same view each run and reflects membership changes', () => {
    const first = world.spawn(Position);
    const result = world.query(Position);
    expect(world.query(Position)).toBe(result);

    const second = world.spawn(Position);
    expect([...result]).toEqual([first, second]);

    // Removals commit on the next run.
    first.remove(Position);
    world.query(Position);
    expect([...result]).toEqual([second]);

    const copy = result.toArray();
    expect(copy).not.toBe(result);
    expect(copy).toEqual([second]);
  });

  it('shares a read-only entity array across query selections without copying', () => {
    const first = world.spawn(Position, Foo);
    const second = world.spawn(Position, Foo);
    const query = world.query(Position, Foo);
    const entities = query.entities;

    expectTypeOf(entities).toEqualTypeOf<readonly Entity[]>();
    expect(Array.isArray(entities)).toBe(true);
    expect(query.entities).toBe(entities);
    expect(query.select(Position).entities).toBe(entities);

    expect(entities).toEqual([first, second]);
  });

  it('exposes only current members after removals, additions, and emptying a query', () => {
    const first = world.spawn(Position);
    const second = world.spawn(Position);
    const third = world.spawn(Position);
    const query = world.query(Position);
    expect(query.entities).toEqual([first, second, third]);

    second.remove(Position);
    expect(query.entities).toEqual([first, third]);

    second.add(Position);
    expect(query.entities).toEqual([first, third, second]);

    first.remove(Position);
    second.remove(Position);
    third.remove(Position);
    expect(query.entities).toEqual([]);

    third.add(Position);
    expect(query.entities).toEqual([third]);
  });

  it('reads indexed entities with array at semantics and respects the live length', () => {
    const first = world.spawn(Position);
    const second = world.spawn(Position);
    const result = world.query(Position);
    const expected = [first, second];

    for (const index of [0, 1, -1, 2]) {
      expect(result.at(index)).toBe(expected.at(index));
    }

    second.destroy();
    world.query(Position);
    expect(result.at(-1)).toBe(first);
    expect(result.at(1)).toBeUndefined();
  });

  it.each([false, true])(
    'skips destroyed entities during a nested each walk (tracked: %s)',
    (tracked) => {
      const first = world.spawn(Position({ x: 1 }));
      const second = world.spawn(Position({ x: 2 }));
      const visited: Entity[] = [];
      let inner: Entity[] = [];
      let replacement!: Entity;
      const changed = vi.fn();
      if (tracked) world.onChange(Position, changed);

      world.query(Position).each((position, entity, index) => {
        visited.push(entity);
        position.x += 10;
        if (index !== 0) return;
        second.destroy();
        replacement = world.spawn(Position({ x: 7 }));
        inner = [...world.query(Position)];
      });

      // The starting membership is walked once and an entity destroyed during the walk is skipped,
      // the nested run skips the pending removal and the replacement waits for the next run.
      expect(visited).toEqual([first]);
      expect(inner).toEqual([first, replacement]);
      expect(first.get(Position)?.x).toBe(11);
      expect(replacement.get(Position)?.x).toBe(7);
      expect([...world.query(Position)]).toEqual([first, replacement]);
      if (tracked) expect(changed.mock.calls).toEqual([[replacement], [first]]);
    }
  );

  it('keeps an outer walk stable across nested updates and query runs', () => {
    const first = world.spawn(Position);
    const second = world.spawn(Position);
    const query = world.query(Position);
    const visited: Entity[] = [];
    let replacement!: Entity;

    for (const entity of query) {
      visited.push(entity);
      if (entity !== first) continue;
      query.each((_position, inner) => {
        if (inner === first) second.destroy();
      });
      replacement = world.spawn(Position);
      const nested = world.query(Position);
      expect(nested.entities).toEqual([first, replacement]);
      expect([...nested]).toEqual([first, replacement]);
    }

    expect(visited).toEqual([first, second]);
    world.query(Position);
    expect([...query]).toEqual([first, replacement]);
  });

  it('keeps a tracking batch stable during iteration and exposes the next batch', () => {
    const Added = createAdded();
    const ref = createQuery(Added(Position));
    world.query(ref);
    const first = world.spawn(Position);
    const second = world.spawn(Position);
    const batch = world.query(ref);
    expect(batch.entities).toEqual([first, second]);
    const visited: Entity[] = [];
    let third!: Entity;

    for (const entity of batch) {
      visited.push(entity);
      if (entity !== first) continue;
      third = world.spawn(Position);
      expect([...world.query(ref)]).toEqual([first, second]);
    }

    expect(visited).toEqual([first, second]);
    expect(world.query(ref).entities).toEqual([third]);
    expect(batch.entities).toEqual([third]);
    expect(world.query(ref).entities).toEqual([]);
  });

  it('releases the iteration guard when a for of loop breaks', () => {
    const first = world.spawn(Position);
    const second = world.spawn(Position);

    for (const entity of world.query(Position)) {
      entity.destroy();
      break;
    }

    expect(first.isAlive()).toBe(false);
    expect([...world.query(Position)]).toEqual([second]);
  });
});
