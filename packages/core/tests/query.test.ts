import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createQuery,
  getQueryVersion,
  createWorld,
  IsExcluded,
  Not,
  Or,
  relation,
  trait,
  type Entity,
} from '../src';

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

  it('should query entities that match the parameters', () => {
    const entityA = world.spawn();
    const entityB = world.spawn();
    const entityC = world.spawn();

    entityA.add(Position, Name, IsActive);
    entityB.add(Position, Name);
    entityC.add(Position);

    let entities: any = world.query(Position, Name, IsActive);
    expect(entities[0]).toBe(entityA);

    // Iteration order follows storage, not join order, so compare as sets.
    entities = world.query(Position, Name);
    expect(new Set(entities)).toEqual(new Set([entityA, entityB]));

    entities = world.query(Position);
    expect(new Set(entities)).toEqual(new Set([entityA, entityB, entityC]));

    entityA.remove(IsActive);
    entities = world.query(Position, Name, IsActive);
    expect(entities.length).toBe(0);
  });

  it('should reuse query hashes regardless of parameter order', () => {
    let entities: any = world.query(Position, Name, Not(IsActive));
    expect(entities.length).toBe(0);

    const entA = world.spawn();
    entA.add(Position, Name);

    entities = world.query(Position, Name, Not(IsActive));
    expect(entities.length).toBe(1);

    entities = world.query(Name, Not(IsActive), Position);
    expect(entities.length).toBe(1);

    expect(createQuery(Position, Name, Not(IsActive)).hash).toBe(
      createQuery(Name, Not(IsActive), Position).hash
    );

    // Test various permutations of modifiers.
    entities = world.query(IsActive, Not(Position, Name));
    expect(entities.length).toBe(0);

    entities = world.query(Not(Name, Position), IsActive);
    expect(entities.length).toBe(0);

    entities = world.query(Not(Position), IsActive, Not(Name));
    expect(entities.length).toBe(0);

    expect(createQuery(IsActive, Not(Position, Name)).hash).toBe(
      createQuery(Not(Name, Position), IsActive).hash
    );
    expect(createQuery(IsActive, Not(Position, Name)).hash).toBe(
      createQuery(Not(Position), IsActive, Not(Name)).hash
    );
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
    expect(entities.updateEach).toBeDefined();

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

  it('excludes hidden entities from inline and cached relation queries', () => {
    const target = world.spawn();
    const visible = world.spawn(ChildOf(target));
    const hidden = world.spawn(ChildOf(target), IsExcluded);
    world.add(ChildOf(target));
    const query = createQuery(ChildOf(target));

    expect([...world.query(ChildOf(target))]).toEqual([visible]);
    expect([...world.query(query)]).toEqual([visible]);
    hidden.remove(IsExcluded);
    expect(world.query(ChildOf(target))).toHaveLength(2);
    expect(world.query(query)).toHaveLength(2);
  });

  it('reads cached query revisions without initializing a world or consuming results', () => {
    const fresh = createWorld();
    const query = createQuery(Position);
    expect(getQueryVersion(fresh, query)).toBeUndefined();
    expect(fresh.isRegistered).toBe(false);
    fresh.destroy();

    world.query(Position);
    const initial = getQueryVersion(world, query)!;
    const onAdd = vi.fn();
    const unsubscribe = world.onQueryAdd(query, onAdd);
    const entity = world.spawn(Position);
    expect(getQueryVersion(world, query)).toBeGreaterThan(initial);
    expect([...world.query(query)]).toEqual([entity]);
    expect(onAdd).toHaveBeenCalledExactlyOnceWith(entity);

    unsubscribe();
    world.spawn(Position);
    expect(onAdd).toHaveBeenCalledTimes(1);
    world.reset();
    expect(getQueryVersion(world, query)).toBeUndefined();
  });

  it('should update stores with updateEach', () => {
    for (let i = 0; i < 10; i++) {
      world.spawn(Position);
    }

    const query = world.query(Position);

    query.updateEach(([position], _entity, index) => {
      if (index === 0) return;
      position.x = 10;
    });

    expect(query.length).toBe(10);
    expect(query[0].get(Position)!.x).toBe(0);

    for (let i = 1; i < 10; i++) {
      expect(query[i].get(Position)!.x).toBe(10);
    }
  });

  it('updateEach can be run with change detection', () => {
    const cb = vi.fn();
    world.onChange(Position, cb);

    for (let i = 0; i < 10; i++) {
      world.spawn(Position);
    }

    const query = world.query(Position);

    query.updateEach(([position], _entity, index) => {
      if (index === 0) return;
      position.x = 10;
    });

    expect(cb).toHaveBeenCalledTimes(9);

    // If values do not change, no events should be triggered.
    query.updateEach(([position], _entity, index) => {
      if (index === 0) return;
      position.x = 10;
    });

    expect(cb).toHaveBeenCalledTimes(9);
  });

  it('should read trait data with readEach without modifying stores', () => {
    for (let i = 0; i < 5; i++) {
      world.spawn(Position({ x: i, y: i * 2 }), Name({ name: `Entity${i}` }));
    }

    const results: any[] = [];
    world.query(Position, Name).readEach(([position, name], entity, index) => {
      results.push({
        x: position.x,
        name: name.name,
        index,
      });
    });

    expect(results).toHaveLength(5);
    expect(results[0]).toEqual({ x: 0, name: 'Entity0', index: 0 });
    expect(results[2]).toEqual({ x: 2, name: 'Entity2', index: 2 });
  });

  it('updateEach should return values in caller parameter order regardless of cache', () => {
    // Create entity with both traits
    world.spawn(Position({ x: 10, y: 20 }), Name({ name: 'test' }));

    // First query with order: Position, Name
    world.query(Position, Name).updateEach(([position, name]) => {
      expect(position).toHaveProperty('x');
      expect(position).toHaveProperty('y');
      expect(name).toHaveProperty('name');
      expect(name.name).toBe('test');
    });

    // Second query with REVERSED order: Name, Position
    // This should return values in the order specified (Name first, Position second)
    world.query(Name, Position).updateEach(([name, position]) => {
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

  it('updates relation target filters when target query membership changes', () => {
    const onAdd = vi.fn();
    const onRemove = vi.fn();

    const parent = world.spawn();
    const child = world.spawn(ChildOf(parent));

    world.onQueryAdd([ChildOf(IsPlayer)], onAdd);
    world.onQueryRemove([ChildOf(IsPlayer)], onRemove);

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
    results.updateEach(([position, name]) => {
      expect(position.x).toBeDefined();
      expect(name.name).toBeDefined();
    });

    // Select only Name.
    results.select(Name).updateEach(([name]) => {
      expect(name.name).toBeDefined();
    });

    // Running query again should reset the selection.
    results = world.query(Position, Name);
    results.updateEach(([position, name]) => {
      expect(position.x).toBeDefined();
      expect(name.name).toBeDefined();
    });
  });

  it('updateEach works with atomic traits', () => {
    const Position = trait(() => ({ x: 0, y: 0 }));
    const Mass = trait(() => ({ value: 0 }));

    const entity = world.spawn(Position, Mass);
    world.query(Position, Mass).updateEach(([position, mass]) => {
      position.x = 1;
      mass.value = 10;
    });

    expect(entity.get(Position)!.x).toBe(1);
    expect(entity.get(Mass)!.value).toBe(10);
  });

  it('updateEach works with atomic traits and change detection', () => {
    const Position = trait(() => ({ x: 0, y: 0 }));
    const cb = vi.fn();
    world.onChange(Position, cb);
    world.spawn(Position);

    expect(cb).toHaveBeenCalledTimes(0);

    world.query(Position).updateEach(([position]) => {
      position.x = 0;
    });

    expect(cb).toHaveBeenCalledTimes(0);

    world.query(Position).updateEach(([position]) => {
      position.x = 1;
    });

    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('updateEach automatically tracks changes for traits observed with onChange', () => {
    const cb = vi.fn();
    world.onChange(Position, cb);

    // This has changes tracked automatically.
    // Here we test that mixing tracked and untracked traits works.
    // We do it would of order to catch misaligned indices internally.
    world.spawn(Position, Name);
    world.query(Name, Position).updateEach(([_, position]) => {
      position.x = 1;
    });

    expect(cb).toHaveBeenCalledTimes(1);

    // This does not have changes tracked automatically.
    world.spawn(Name);
    world.query(Name).updateEach(([name]) => {
      name.name = 'name';
    });

    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('updateEach visits each entity once while the callback changes the layout', () => {
    const entities = Array.from({ length: 12 }, (_, i) =>
      i % 2 === 0 ? world.spawn(Position({ x: i })) : world.spawn(Position({ x: i }), Foo)
    );
    const visited: number[] = [];

    world.query(Position).updateEach(([position], entity) => {
      visited.push(position.x);
      // Moves this entity to another archetype, destroys a visited one, spawns a new one.
      if (position.x === 2) entity.add(Bar);
      if (position.x === 4) entities[0].destroy();
      if (position.x === 6) world.spawn(Position({ x: 100 }));
      position.y = position.x + 1;
    });

    expect([...visited].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(new Set(visited).size).toBe(visited.length);
    for (const index of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]) {
      expect(entities[index].get(Position)).toEqual({ x: index, y: index + 1 });
    }
    expect(entities[2].has(Bar)).toBe(true);
  });

  it('updateEach and readEach agree across callbacks on a large result', () => {
    for (let i = 0; i < 300; i++) world.spawn(Position({ x: i }));
    const query = world.query(Position);

    query.updateEach(([position]) => {
      position.y += 1;
    });
    query.updateEach(([position]) => {
      position.y += position.x;
    });
    let sum = 0;
    query.readEach(([position], _entity, index) => {
      sum += position.y;
      expect(index).toBeLessThan(300);
    });

    expect(sum).toBe(300 + (299 * 300) / 2);
  });

  it('updateEach survives a change observer that moves the next entity', () => {
    const entities = Array.from({ length: 6 }, (_, i) => world.spawn(Position({ x: i })));
    world.onChange(Position, (entity) => {
      if (entity === entities[2]) entities[3].add(Foo);
    });
    const visited: number[] = [];

    world.query(Position).updateEach(([position]) => {
      visited.push(position.x);
      position.y = 5;
    });

    expect(visited).toEqual([0, 1, 2, 3, 4, 5]);
    expect(entities[3].has(Foo)).toBe(true);
    for (const entity of entities) expect(entity.get(Position)!.y).toBe(5);
  });

  it('passes the entity to every callback shape', () => {
    for (const count of [3, 300]) {
      world.reset();
      const entities = Array.from({ length: count }, () => world.spawn(Position));
      const received: unknown[][] = [];
      const query = world.query(Position);

      query.updateEach(([position], entity = entities[0]) => {
        received.push([entity]);
        position.x = 1;
      });
      query.readEach(function () {
        // oxlint-disable-next-line prefer-rest-params -- Checks what `arguments` forwards.
        received.push([arguments[1]]);
      });
      query.readEach((...args) => received.push([args[1]]));

      expect(received).toEqual([...entities, ...entities, ...entities].map((entity) => [entity]));
    }
  });

  it('passes only the records when entity is false', () => {
    for (const count of [3, 300]) {
      world.reset();
      const entities = Array.from({ length: count }, (_, i) => world.spawn(Position({ x: i })));
      const changed: number[] = [];
      world.onChange(Position, () => changed.push(1));
      const query = world.query(Position);
      const lengths = new Set<number>();

      query.updateEach(
        (...args) => {
          lengths.add(args.length);
          args[0][0].y = args[0][0].x * 2;
        },
        { entity: false }
      );
      query.readEach((...args) => lengths.add(args.length), { entity: false });

      expect([...lengths]).toEqual([1]);
      entities.forEach((entity, i) => expect(entity.get(Position)!.y).toBe(i * 2));
      expect(changed.length).toBe(count - 1);
      // @ts-expect-error The callback cannot declare an entity when entity is false.
      query.readEach((_state, _entity) => {}, { entity: false });
      // @ts-expect-error The callback cannot declare an entity when entity is false.
      query.updateEach((_state, _entity) => {}, { entity: false, changeDetection: 'never' });
    }
  });

  it('updateEach stores the writes of an entity that moved after many spawns', () => {
    const Other = trait();
    const entities = Array.from({ length: 4 }, (_, i) => world.spawn(Position({ x: i })));

    world.query(Position).updateEach(([position], entity) => {
      if (position.x === 0) {
        for (let i = 0; i < 5000; i++) world.spawn(Other);
        entity.add(Foo);
      }
      position.y = 7;
    });

    for (const entity of entities) expect(entity.get(Position)!.y).toBe(7);
  });

  it('updateEach stores every trait of an entity a change observer destroys', () => {
    const Velocity = trait({ x: 0, y: 0 });
    const entities = Array.from({ length: 4 }, (_, i) =>
      world.spawn(Position({ x: i }), Velocity({ x: i * 10 }))
    );
    world.onChange(Position, (entity) => {
      if (entity === entities[0]) entity.destroy();
    });

    world.query(Position, Velocity).updateEach(([position, velocity]) => {
      if (position.x === 0) {
        position.y = 1;
        velocity.x = 999;
      }
    });

    expect(entities[0].isAlive()).toBe(false);
    for (const index of [1, 2, 3]) {
      expect(entities[index].get(Velocity)!.x).toBe(index * 10);
      expect(entities[index].get(Position)!.y).toBe(0);
    }
  });

  it('updateEach gives undefined for a trait an Or branch lacks and stores the others', () => {
    const both = world.spawn(Position({ x: 1 }), Name({ name: 'both' }));
    const onlyPosition = world.spawn(Position({ x: 2 }));
    const onlyName = world.spawn(Name({ name: 'only' }));
    const seen: [number | undefined, string | undefined][] = [];

    world.query(Or(Position, Name)).updateEach(([position, name]) => {
      seen.push([position?.x, name?.name]);
      if (position) position.y = 9;
      if (name) name.name += '!';
    });

    expect(seen).toHaveLength(3);
    expect(seen).toContainEqual([1, 'both']);
    expect(seen).toContainEqual([2, undefined]);
    expect(seen).toContainEqual([undefined, 'only']);
    expect(both.get(Position)!.y).toBe(9);
    expect(both.get(Name)!.name).toBe('both!');
    expect(onlyPosition.get(Position)!.y).toBe(9);
    expect(onlyName.get(Name)!.name).toBe('only!');
  });

  it('getPages follows rows that moved between matched archetypes', () => {
    const entities = Array.from({ length: 4 }, (_, i) => world.spawn(Position({ x: i })));
    const rows = () =>
      world
        .query(Position)
        .getPages()
        .flatMap(({ stores: [position], indices }) => Array.from(indices, (row) => position.x[row]));
    expect(rows().sort((a, b) => a - b)).toEqual([0, 1, 2, 3]);

    entities[1].add(Foo);
    expect(rows().sort((a, b) => a - b)).toEqual([0, 1, 2, 3]);
  });

  it('keeps one result while entities move between matched archetypes', () => {
    const entities = Array.from({ length: 300 }, (_, i) => world.spawn(Position({ x: i })));
    const result = world.query(Position);

    for (let frame = 0; frame < 3; frame++) {
      const moved = entities[frame * 7];
      if (moved.has(Foo)) moved.remove(Foo);
      else moved.add(Foo);
      expect(world.query(Position)).toBe(result);

      const seen: number[] = [];
      result.updateEach(([position], entity) => {
        expect(entity.get(Position)!.x).toBe(position.x);
        seen.push(position.x);
        position.y += 1;
      });
      expect(seen.sort((a, b) => a - b)).toEqual(entities.map((_, i) => i));
      // The loops follow storage without reordering the shared array.
      expect([...result]).toEqual(entities);
    }
    for (const entity of entities) expect(entity.get(Position)!.y).toBe(3);
  });

  it('iterates a cached result once per entity while loops run on it and entities move', () => {
    const entities = Array.from({ length: 6 }, (_, i) =>
      i % 2 === 0 ? world.spawn(Position) : world.spawn(Position, Foo)
    );
    const before = [...world.query(Position)];
    const visited: Entity[] = [];

    for (const entity of world.query(Position)) {
      visited.push(entity);
      if (entity.has(Foo)) entity.remove(Foo);
      else entity.add(Foo);
      world.query(Position).readEach(() => {});
      world.query(Position).updateEach(([position]) => {
        position.x += 1;
      });
      world.query(Position).getPages();
    }

    expect(visited).toEqual(before);
    expect(new Set(visited)).toEqual(new Set(entities));
    for (const entity of entities) expect(entity.get(Position)!.x).toBe(6);
  });

  it('updateEach does not overwrite when a trait is set instead of mutated', () => {
    const entity = world.spawn(Position);

    world.query(Position).updateEach((_, entity) => {
      entity.set(Position, { x: 10 });
    });

    const position = entity.get(Position);
    expect(position!.x).toBe(10);
  });

  it('should get all queryable entities from an emtpy query', () => {
    let entities = world.query();
    expect(entities.length).toBe(0);

    world.spawn(Position);
    world.spawn(Name);
    world.spawn(IsExcluded);

    entities = world.query();
    expect(entities.length).toBe(2);

    entities.forEach((entity) => entity.destroy());

    entities = world.query();
    expect(entities.length).toBe(0);
  });

  it('shares a result until membership changes and sorts a copy', () => {
    const a = world.spawn(Position);
    const b = world.spawn(Position);
    const first = world.query(Position);
    expect(world.query(Position)).toBe(first);

    const sorted = first.sort((x, y) => y - x);
    expect(sorted).not.toBe(first);
    expect([...first]).toEqual([a, b]);
    expect([...sorted]).toEqual([a, b].sort((x, y) => y - x));

    const c = world.spawn(Position);
    const second = world.query(Position);
    expect(second).not.toBe(first);
    expect([...second]).toContain(c);
    expect([...first]).toEqual([a, b]);
  });

  it('can sort query results', () => {
    const entityA = world.spawn(Position);
    const entityB = world.spawn(Position);
    const entityC = world.spawn(Position);
    const entityD = world.spawn(Position);

    let entities = world.query(Position);
    expect(entities[0]).toBe(entityA);
    expect(entities[1]).toBe(entityB);
    expect(entities[2]).toBe(entityC);
    expect(entities[3]).toBe(entityD);

    entityC.destroy();

    entities = world.query(Position);
    expect(entities[0]).toBe(entityA);
    expect(entities[1]).toBe(entityB);
    expect(entities[2]).toBe(entityD);

    // Recycles the entity id from entityC (3).
    const entityE = world.spawn(Position);

    entities = world.query(Position);
    expect(entities[0]).toBe(entityA);
    expect(entities[1]).toBe(entityB);
    expect(entities[2]).toBe(entityD);
    expect(entities[3]).toBe(entityE);

    entities = entities.sort();

    // Test the entity.id() are in ascending order.
    for (let i = 1; i < entities.length; i++) {
      expect(entities[i].id()).toBeGreaterThan(entities[i - 1].id());
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
    const resultsBefore = world.query(movementQuery);

    world.reset();
    spawnEntities();

    const resultsAfter = world.query(movementQuery);

    expect(resultsAfter.length).toBe(resultsBefore.length);
  });
});
