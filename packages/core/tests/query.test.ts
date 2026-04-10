import { beforeEach, describe, expect, it, vi } from 'vitest';
import { $internal, createQuery, createWorld, IsExcluded, Not, Or, relation, trait } from '../src';

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

        entities = world.query(Position, Name);
        expect(entities[0]).toBe(entityA);
        expect(entities[1]).toBe(entityB);

        entities = world.query(Position);
        expect(entities[0]).toBe(entityA);
        expect(entities[1]).toBe(entityB);
        expect(entities[2]).toBe(entityC);

        entityA.remove(IsActive);
        entities = world.query(Position, Name, IsActive);
        expect(entities.length).toBe(0);
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

    it('useStores groups entities into query pages', () => {
        const localWorld = createWorld();

        // Pages are 1024 entities wide
        for (let i = 0; i < 1026; i++) {
            localWorld.spawn(Position({ x: i, y: i * 2 }));
        }

        const query = localWorld.query(Position);

        query.useStores(([position], layout) => {
            expect(layout.pageCount).toBe(2);

            const firstEntityId = layout.entities[0].id();
            const firstPageId = layout.pageIds[0];
            const secondPageId = layout.pageIds[1];

            expect(layout.pageCounts[0]).toBe(1023);
            expect(layout.offsets[0]).toBe(firstEntityId & 1023);
            expect(layout.entities[0].id()).toBe(firstEntityId);
            expect(position.x[firstPageId][layout.offsets[1]]).toBe(1);

            expect(layout.pageCounts[1]).toBe(3);
            expect(Array.from(layout.offsets.slice(layout.pageStarts[1]))).toEqual([0, 1, 2]);
            expect(layout.entities.slice(layout.pageStarts[1]).map((entity) => entity.id())).toEqual([
                firstEntityId + 1023,
                firstEntityId + 1024,
                firstEntityId + 1025,
            ]);
            expect(position.x[secondPageId][layout.offsets[layout.pageStarts[1] + 2]]).toBe(1025);
        });

        localWorld.destroy();
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

    it.fails('updateEach does not overwrite when a trait is set instead of mutated', () => {
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

        entities.sort();

        // Test the entity.id() are in ascending order.
        // [1, 2, 3, 4]
        for (let i = 0; i < entities.length; i++) {
            expect(entities[i].id()).toBe(i + 1);
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
