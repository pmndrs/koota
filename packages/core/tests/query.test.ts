import { beforeEach, describe, expect, it, vi } from 'vitest';
import { $internal, cacheQuery, createWorld, IsExcluded, Not, Or, trait } from '../src';

const Position = trait({ x: 0, y: 0 });
const Name = trait({ name: 'name' });
const IsActive = trait();
const Foo = trait();
const Bar = trait();

describe('Query', () => {
	const world = createWorld();
	world.init();

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

	it('can be subscribed to for a stream of updates', () => {
		const event = { entity: 0 };
		const staticCb = vi.fn((entity) => {
			event.entity = entity;
		});

		// Static query subscriptions.
		const entity = world.spawn();

		// With a cache key.
		const queryKey = cacheQuery(Position, Foo);
		world.onQueryAdd(queryKey, staticCb);
		world.onQueryRemove(queryKey, staticCb);

		entity.add(Position);
		expect(staticCb).toHaveBeenCalledTimes(0);

		entity.add(Foo);
		expect(staticCb).toHaveBeenCalledTimes(1);
		expect(event.entity).toBe(entity);

		entity.remove(Foo);
		expect(staticCb).toHaveBeenCalledTimes(2);
		expect(event.entity).toBe(entity);

		// With parameters.
		world.onQueryAdd([Position, Bar], staticCb);
		world.onQueryRemove([Position, Bar], staticCb);

		entity.add(Position);
		expect(staticCb).toHaveBeenCalledTimes(2);

		entity.add(Bar);
		expect(staticCb).toHaveBeenCalledTimes(3);
		expect(event.entity).toBe(entity);

		entity.remove(Bar);
		expect(staticCb).toHaveBeenCalledTimes(4);
		expect(event.entity).toBe(entity);

		entity.remove(Position);
		expect(staticCb).toHaveBeenCalledTimes(4);
	});

	it('calls onAdd after the trait is added with data', () => {
		const entity = world.spawn();

		world.onAdd(Position, (entity) => {
			expect(entity.get(Position)!.x).toBe(10);
		});

		entity.add(Position({ x: 10, y: 20 }));
	});

	it('can subscribe to changes on a specific trait', () => {
		const entityA = world.spawn(Position);
		const entityB = world.spawn(Position);

		const cb = vi.fn();
		let unsub = world.onChange(Position, cb);

		entityA.set(Position, { x: 10, y: 20 });

		expect(cb).toHaveBeenCalledTimes(1);
		expect(cb).toHaveBeenCalledWith(entityA);

		unsub();

		entityA.set(Position, { x: 20, y: 30 });

		expect(cb).toHaveBeenCalledTimes(1);

		entityA.changed(Name);

		expect(cb).toHaveBeenCalledTimes(1);

		// Test that subscribing to multiple entities with the same trait works.
		unsub = world.onChange(Position, cb);

		const cb2 = vi.fn();
		world.onChange(Position, cb2);

		entityB.set(Position, { x: 10, y: 20 });

		expect(cb).toHaveBeenCalledTimes(2);
		expect(cb2).toHaveBeenCalledTimes(1);
		expect(cb2).toHaveBeenCalledWith(entityB);

		// Remove one unsub to test that we don't accidentally remove trait tracking
		// for all callbacks associated with the trait.
		unsub();

		// Test changed detection with updateEach.
		world.query(Position).updateEach(([position]) => {
			position.x = 100;
		});

		// Increments by 2 because we are updating two entities.
		expect(cb2).toHaveBeenCalledTimes(3);
	});

	it('can cache and use the query key', () => {
		const key = cacheQuery(Position, Name, IsActive);

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

	it('should select traits', () => {
		world.spawn(Position, Name);

		const results = world.query(Position, Name);
		// Default should be the same as the query.
		results.updateEach(([position, name]) => {
			expect(position.x).toBeDefined();
			expect(name.name).toBeDefined();
		});

		// Select only Name.
		results.select(Name).updateEach(([name]) => {
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
});
