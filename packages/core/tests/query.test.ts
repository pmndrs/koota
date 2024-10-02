import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cacheQuery, createWorld } from '../src';
import { define } from '../src/component/component';
import { createAdded } from '../src/query/modifiers/added';
import { createChanged } from '../src/query/modifiers/changed';
import { Not } from '../src/query/modifiers/not';
import { createRemoved } from '../src/query/modifiers/removed';
import { $internal } from '../src/world/symbols';
import { IsExcluded } from '../src/query/query';

const Position = define({ x: 0, y: 0 });
const Name = define({ name: 'name' });
const IsActive = define();
const Foo = define({});
const Bar = define({});

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

		let entities = world.query(Position, Name, IsActive);
		expect(entities).toEqual([entityA]);

		entities = world.query(Position, Name);
		expect(entities).toEqual([entityA, entityB]);

		entities = world.query(Position);
		expect(entities).toEqual([entityA, entityB, entityC]);

		entityA.remove(IsActive);
		entities = world.query(Position, Name, IsActive);
		expect(entities).toEqual([]);
	});

	it('should only create one hash indpendent of the order of the parameters', () => {
		const ctx = world[$internal];
		let entities = world.query(Position, Name, Not(IsActive));
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

	it('should return an empty array if there are no query parameters', () => {
		world.spawn();
		const entities = world.query();
		expect(entities).toEqual([]);
	});

	it('should correctly populate Not queries when components are added and removed', () => {
		const entityA = world.spawn();
		const entityB = world.spawn();
		const entityC = world.spawn();

		let entities = world.query(Foo);
		expect(entities.length).toBe(0);

		entities = world.query(Not(Foo));
		expect(entities).toEqual([entityA, entityB, entityC]);

		// Add
		entityA.add(Foo);
		entityB.add(Bar);
		entityC.add(Foo, Bar);

		entities = world.query(Foo);
		expect(entities).toEqual([entityA, entityC]);

		entities = world.query(Foo, Bar);
		expect(entities).toEqual([entityC]);

		entities = world.query(Not(Foo));
		expect(entities).toEqual([entityB]);

		// Remove
		entityA.remove(Foo);

		entities = world.query(Foo);
		expect(entities).toEqual([entityC]);

		entities = world.query(Not(Foo));
		expect(entities).toEqual([entityB, entityA]);

		entities = world.query(Not(Foo), Not(Bar));
		expect(entities).toEqual([entityA]);

		// Remove more so entity A and C have no components
		entityC.remove(Foo);
		entityC.remove(Bar);

		entities = world.query(Not(Foo), Not(Bar));
		expect(entities.length).toBe(2);

		entities = world.query(Not(Foo));
		expect(entities.length).toBe(3);
	});

	it('modifiers can be added as one call or separately', () => {
		const ctx = world[$internal];
		const entity = world.spawn();
		entity.add(Position, IsActive);

		let entities = world.query(Not(Foo), Not(Bar));
		expect(entities.length).toBe(1);

		entities = world.query(Not(Foo, Bar));
		expect(entities.length).toBe(1);

		// These queries should be hashed the same.
		expect(ctx.queriesHashMap.size).toBe(1);
	});

	it('should correctly populate Added queries when components are added', () => {
		const Added = createAdded();

		const entityA = world.spawn();
		const entityB = world.spawn();
		const entityC = world.spawn();

		let entities: readonly number[] = [];

		entities = world.query(Added(Foo));
		expect(entities.length).toBe(0);

		entityA.add(Foo);
		entities = world.query(Added(Foo));
		expect(entities).toEqual([entityA]);

		// The query gets drained and should be empty when run again.
		entities = world.query(Added(Foo));
		expect(entities.length).toBe(0);

		entityB.add(Foo);
		entities = world.query(Added(Foo));
		expect(entities).toEqual([entityB]);

		// And a static query should give both entities.
		entities = world.query(Foo);
		expect(entities).toEqual([entityA, entityB]);

		// Should not be added to the query if the component is removed before it is read.
		entityC.add(Foo);
		entityC.remove(Foo);
		entities = world.query(Added(Foo));
		expect(entities.length).toBe(0);

		// But if it is removed and added again in the same frame it should be recorded.
		entityA.remove(Foo);
		entityA.add(Foo);
		entities = world.query(Added(Foo));
		expect(entities).toEqual([entityA]);

		// Should only populate the query if tracked component is added,
		// even if it matches the query otherwise.
		entityA.remove(Foo, Bar); // Quick reset
		entityA.add(Foo);
		world.query(Added(Foo)); // Drain query

		entityA.add(Bar);
		entities = world.query(Added(Foo));
		expect(entities.length).toBe(0); // Fails for Added
		entities = world.query(Foo, Bar);
		expect(entities).toEqual([entityA]); // But matches static query
	});

	it('should properly populate Added queries with mulitple tracked components', () => {
		const Added = createAdded();

		const entityA = world.spawn();
		const entityB = world.spawn();

		let entities = world.query(Added(Foo, Bar));
		expect(entities.length).toBe(0);

		entityA.add(Foo);
		entities = world.query(Added(Foo, Bar));
		expect(entities.length).toBe(0);

		entityA.add(Bar);
		entities = world.query(Added(Foo, Bar));
		expect(entities).toEqual([entityA]);

		entityB.add(Foo);
		entities = world.query(Added(Foo, Bar));
		expect(entities.length).toBe(0);

		entityB.add(Bar);
		entities = world.query(Added(Foo, Bar));
		expect(entities).toEqual([entityB]);
	});

	it('should track multiple Added modifiers independently', () => {
		const Added = createAdded();
		const Added2 = createAdded();

		const entityA = world.spawn();
		const entityB = world.spawn();

		let entities = world.query(Added(Foo));
		expect(entities.length).toBe(0);

		let entities2 = world.query(Added2(Foo));
		expect(entities2.length).toBe(0);

		entityA.add(Foo);
		entities = world.query(Added(Foo));
		expect(entities.length).toBe(1);

		entityB.remove(Foo);
		entityB.add(Foo);
		entities = world.query(Added(Foo));
		entities2 = world.query(Added2(Foo));

		expect(entities.length).toBe(1);
		expect(entities2.length).toBe(2);
	});

	it('should populate Added queries even if they are registered after the component is added', () => {
		const Added = createAdded();

		const entityA = world.spawn(Foo);
		const entityB = world.spawn(Foo, Bar);

		let entities = world.query(Added(Foo));
		expect(entities).toEqual([entityA, entityB]);

		entities = world.query(Added(Foo, Bar));
		expect(entities).toEqual([entityB]);

		const LaterAdded = createAdded();

		let entities2 = world.query(LaterAdded(Foo));
		expect(entities2.length).toBe(0);

		entityA.remove(Foo); // Reset
		entityA.add(Foo);
		entities = world.query(Added(Foo));
		entities2 = world.query(LaterAdded(Foo));

		expect(entities.length).toBe(1);
		expect(entities2.length).toBe(1);
	});

	it('should combine Not and Added modifiers with logical AND', () => {
		const Added = createAdded();

		const entityA = world.spawn();
		const entityB = world.spawn();

		// No entities should match this query since while Not will match
		// all empty entities, Added will only match entities that have Foo.
		let entities = world.query(Added(Foo), Not(Bar));
		expect(entities.length).toBe(0);

		// Adding Foo to entityA should match the query as it has Foo added and not Bar.
		entityA.add(Foo);
		entities = world.query(Added(Foo), Not(Bar));
		expect(entities).toEqual([entityA]);

		// Adding Foo and Bar to entityB should not match the query as it has Bar.
		entityB.add(Foo, Bar);
		entities = world.query(Added(Foo), Not(Bar));
		expect(entities.length).toBe(0);
	});

	it('should properly populate Removed queries when components are removed', () => {
		const Removed = createRemoved();

		const entityA = world.spawn();
		const entityB = world.spawn();

		let entities = world.query(Removed(Foo));
		expect(entities.length).toBe(0);

		entityA.add(Foo);
		entityB.add(Foo);
		entities = world.query(Removed(Foo));
		expect(entities.length).toBe(0);

		entityA.remove(Foo);
		entities = world.query(Removed(Foo));
		expect(entities).toEqual([entityA]);

		// Should work with components added and removed in the same frame.
		entityA.add(Foo);
		entityA.remove(Foo);
		entities = world.query(Removed(Foo));
		expect(entities).toEqual([entityA]);

		// Should track between Removed modifiers independently.
		const Removed2 = createRemoved();

		let entities2 = world.query(Removed2(Foo));
		expect(entities2.length).toBe(0);

		entityA.add(Foo);
		entityA.remove(Foo);
		entities = world.query(Removed(Foo));
		expect(entities.length).toBe(1);

		entityB.add(Foo);
		entityB.remove(Foo);
		entities = world.query(Removed(Foo));
		entities2 = world.query(Removed2(Foo));

		expect(entities.length).toBe(1);
		expect(entities2.length).toBe(2);
	});

	it('should populate Removed queries even if they are registered after the component is removed', () => {
		const Removed = createRemoved();

		const entity = world.spawn(Foo);
		entity.remove(Foo);

		let entities = world.query(Removed(Foo));
		expect(entities).toEqual([entity]);

		entity.add(Foo); // Reset

		const LaterRemoved = createRemoved();

		let entities2 = world.query(LaterRemoved(Foo));
		expect(entities2.length).toBe(0);

		entity.remove(Foo);
		entities = world.query(Removed(Foo));
		entities2 = world.query(LaterRemoved(Foo));

		expect(entities.length).toBe(1);
		expect(entities2.length).toBe(1);
	});

	it('should combine Not and Removed modifiers with logical AND', () => {
		const Removed = createRemoved();

		const entityA = world.spawn();
		const entityB = world.spawn();

		// Initially, no entities should match the query because no entities
		// have Foo removed even though Not matches all empty entities.
		let entities = world.query(Removed(Foo), Not(Bar));
		expect(entities.length).toBe(0);

		// Add Foo to entityA, then it should not match as it hasn't been removed yet.
		entityA.add(Foo);
		entities = world.query(Removed(Foo), Not(Bar));
		expect(entities.length).toBe(0);

		// Add Foo and Bar to entityB, it also should not match as
		// Foo hasn't been removed and it has Bar.
		entityB.add(Foo, Bar);
		entities = world.query(Removed(Foo), Not(Bar));
		expect(entities.length).toBe(0);

		// Remove Foo from entityA, it should now match as Foo is removed and
		// it does not have Bar.
		entityA.remove(Foo);
		entities = world.query(Removed(Foo), Not(Bar));
		expect(entities).toEqual([entityA]);

		// Remove Foo from entityB, it should still not match as it has Bar.
		entityB.remove(Foo);
		entities = world.query(Removed(Foo), Not(Bar));
		expect(entities.length).toBe(0);
	});

	it('should combine Added and Removed modifiers with logical AND', () => {
		const Added = createAdded();
		const Removed = createRemoved();

		const entityA = world.spawn();
		const entityB = world.spawn();

		let entities = world.query(Added(Foo), Removed(Bar));
		expect(entities.length).toBe(0);

		// Add Foo to entityA and Bar to entityB.
		// Neither entity should match the query.
		entityA.add(Foo);
		entityB.add(Bar);
		entities = world.query(Added(Foo), Removed(Bar));
		expect(entities.length).toBe(0);

		// Remove Foo from entityA and remove Bar from entityB.
		// Neither entity should match the query.
		entityA.remove(Foo);
		entityB.remove(Bar);
		entities = world.query(Added(Foo), Removed(Bar));
		expect(entities.length).toBe(0);

		// Add Foo and Bar to entityA, then remove Bar.
		// This entity should now match the query.
		entityA.add(Foo, Bar);
		entityA.remove(Bar);
		entities = world.query(Added(Foo), Removed(Bar));
		expect(entities).toEqual([entityA]);

		// Resets and can fill again.
		entityA.remove(Foo);
		entityA.add(Foo);
		entities = world.query(Added(Foo), Removed(Bar));
		expect(entities).toEqual([entityA]);

		// Add Foo to entityB and remove Bar.
		// This entity should now match the query.
		entityB.add(Foo, Bar);
		entityB.remove(Bar);
		entities = world.query(Added(Foo), Removed(Bar));
		expect(entities).toEqual([entityB]);

		// Make sure changes in one entity do not leak to the other.
		const entityC = world.spawn();
		const entityD = world.spawn();

		entityC.add(Foo);
		entityD.add(Bar);
		entityD.remove(Bar);

		entities = world.query(Added(Foo), Removed(Bar));
		expect(entities.length).toBe(0);
	});

	it('should properly populate Changed queries when components are changed', () => {
		const Changed = createChanged();

		const entityA = world.spawn();

		let entities = world.query(Changed(Position));
		expect(entities.length).toBe(0);

		entityA.add(Position);
		entities = world.query(Changed(Position));
		expect(entities.length).toBe(0);

		const positions = world.getStore(Position);
		positions.x[entityA] = 10;
		positions.y[entityA] = 20;

		// Set changed should populate the query.
		entityA.changed(Position);
		entities = world.query(Changed(Position));
		expect(entities).toEqual([entityA]);

		// Querying again should not return the entity.
		entities = world.query(Changed(Position));
		expect(entities.length).toBe(0);

		// Should not populate the query if the component is removed.
		entityA.remove(Position);
		entityA.changed(Position);
		entities = world.query(Changed(Position));
		expect(entities.length).toBe(0);
	});

	it('should populate Changed queries even if they are registered after the component is changed', () => {
		const Changed = createChanged();

		const entity = world.spawn(Position);

		const positions = world.getStore(Position);
		positions.x[entity] = 10;
		positions.y[entity] = 20;
		entity.changed(Position);

		let entities = world.query(Changed(Position));
		// expect(entities).toEqual([entity]);

		const LaterChanged = createChanged();

		let entities2 = world.query(LaterChanged(Position));
		expect(entities2.length).toBe(0);

		positions.x[entity] = 30;
		positions.y[entity] = 40;
		entity.changed(Position);

		entities = world.query(Changed(Position));
		entities2 = world.query(LaterChanged(Position));

		expect(entities.length).toBe(1);
		expect(entities2.length).toBe(1);
	});

	it('can be subscribed to for a stream of updates', () => {
		const event = { type: '', entity: 0 };
		const staticCb = vi.fn((type, entity) => {
			event.type = type;
			event.entity = entity;
		});

		// Static query subscriptions.
		const entity = world.spawn();

		world.query.subscribe([Position, Foo], staticCb);

		entity.add(Position);
		expect(staticCb).toHaveBeenCalledTimes(0);

		entity.add(Foo);
		expect(staticCb).toHaveBeenCalledTimes(1);
		expect(event.type).toBe('add');
		expect(event.entity).toBe(entity);

		entity.remove(Foo);
		expect(staticCb).toHaveBeenCalledTimes(2);
		expect(event.type).toBe('remove');
		expect(event.entity).toBe(entity);

		// Added query subscriptions.
		// This acts the same as a static query since we
		// get a stream of matching if the components were added.
		const trackingCb = vi.fn();
		const Added = createAdded();

		world.query.subscribe([Added(Foo)], trackingCb);

		entity.add(Foo);
		expect(trackingCb).toHaveBeenCalledTimes(1);
		expect(trackingCb).toHaveBeenCalledWith('add', entity);

		entity.remove(Foo);
		expect(trackingCb).toHaveBeenCalledTimes(2);
		expect(trackingCb).toHaveBeenCalledWith('remove', entity);

		// Removed query subscriptions.
		const Removed = createRemoved();
		const removedCb = vi.fn();

		world.query.subscribe([Removed(Foo)], removedCb);

		entity.add(Foo);
		expect(removedCb).toHaveBeenCalledTimes(0);

		entity.remove(Foo);
		expect(removedCb).toHaveBeenCalledTimes(1);
		expect(removedCb).toHaveBeenCalledWith('add', entity);

		entity.add(Foo);
		expect(removedCb).toHaveBeenCalledTimes(2);
		expect(removedCb).toHaveBeenCalledWith('remove', entity);
	});

	it('can subscribe to changes on a specific component', () => {
		const entity = world.spawn(Position);

		const cb = vi.fn();
		const unsub = world.changed.subscribe(Position, cb);

		const positions = world.getStore(Position);
		positions.x[entity] = 10;
		positions.y[entity] = 20;

		entity.changed(Position);

		expect(cb).toHaveBeenCalledTimes(1);
		expect(cb).toHaveBeenCalledWith(entity);

		unsub();

		positions.x[entity] = 30;
		positions.y[entity] = 40;

		entity.changed(Position);

		expect(cb).toHaveBeenCalledTimes(1);

		entity.changed(Name);

		expect(cb).toHaveBeenCalledTimes(1);
	});

	it('can cache and use the query key', () => {
		const key = cacheQuery(Position, Name, IsActive);

		const entityA = world.spawn();
		const entityB = world.spawn();

		entityA.add(Position, Name, IsActive);
		entityB.add(Position, Name);

		let entities = world.query(key);

		expect(entities).toEqual([entityA]);
	});

	it('should exclude entities with IsExcluded', () => {
		world.spawn(Position, IsExcluded);
		let entities = world.query(Position);
		expect(entities.length).toBe(0);
	});
});
