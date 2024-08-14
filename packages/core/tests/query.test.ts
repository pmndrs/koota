import { beforeEach, describe, expect, it, vi } from 'vitest';
import { define } from '../src/component/component';
import { createAdded } from '../src/query/modifiers/added';
import { createChanged } from '../src/query/modifiers/changed';
import { Not } from '../src/query/modifiers/not';
import { createRemoved } from '../src/query/modifiers/removed';
import { $queriesHashMap } from '../src/world/symbols';
import { World } from '../src/world/world';

const Position = define({ x: 0, y: 0 });
const Name = define({ name: 'name' });
const IsActive = define();
const Foo = define({});
const Bar = define({});

describe('Query', () => {
	const world = new World();
	world.init();

	beforeEach(() => {
		world.reset();
	});

	it('should query entities that match the parameters', () => {
		const entityA = world.create();
		const entityB = world.create();
		const entityC = world.create();

		world.add(entityA, Position, Name, IsActive);
		world.add(entityB, Position, Name);
		world.add(entityC, Position);

		let entities = world.query(Position, Name, IsActive);
		expect(entities).toEqual([entityA]);

		entities = world.query(Position, Name);
		expect(entities).toEqual([entityA, entityB]);

		entities = world.query(Position);
		expect(entities).toEqual([entityA, entityB, entityC]);

		world.remove(entityA, IsActive);
		entities = world.query(Position, Name, IsActive);
		expect(entities).toEqual([]);
	});

	it('should only create one hash indpendent of the order of the parameters', () => {
		let entities = world.query(Position, Name, IsActive);
		expect(entities.length).toBe(0);

		const entA = world.create();
		world.add(entA, Position, Name, IsActive);

		entities = world.query(Position, Name, IsActive);
		expect(entities.length).toBe(1);

		entities = world.query(Name, IsActive, Position);
		expect(entities.length).toBe(1);

		expect(world[$queriesHashMap].size).toBe(1);
	});

	it('should return an empty array if there are no query parameters', () => {
		const entity = world.create();
		const entities = world.query();
		expect(entities).toEqual([]);
	});

	it('should correctly populate Not queries when components are added and removed', () => {
		const entityA = world.create();
		const entityB = world.create();
		const entityC = world.create();

		let entities = world.query(Foo);
		expect(entities.length).toBe(0);

		entities = world.query(Not(Foo));
		expect(entities).toEqual([entityA, entityB, entityC]);

		// Add
		world.add(entityA, Foo);
		world.add(entityB, Bar);
		world.add(entityC, Foo, Bar);

		entities = world.query(Foo);
		expect(entities).toEqual([entityA, entityC]);

		entities = world.query(Foo, Bar);
		expect(entities).toEqual([entityC]);

		entities = world.query(Not(Foo));
		expect(entities).toEqual([entityB]);

		// Remove
		world.remove(entityA, Foo);

		entities = world.query(Foo);
		expect(entities).toEqual([entityC]);

		entities = world.query(Not(Foo));
		expect(entities).toEqual([entityB, entityA]);

		entities = world.query(Not(Foo), Not(Bar));
		expect(entities).toEqual([entityA]);

		// Remove more so entity A and C have no components
		world.remove(entityC, Foo);
		world.remove(entityC, Bar);

		entities = world.query(Not(Foo), Not(Bar));
		expect(entities.length).toBe(2);

		entities = world.query(Not(Foo));
		expect(entities.length).toBe(3);
	});

	it('modifiers can be added as one call or separately', () => {
		const entity = world.create();
		world.add(entity, Position, IsActive);

		let entities = world.query(Not(Foo), Not(Bar));
		expect(entities.length).toBe(1);

		entities = world.query(Not(Foo, Bar));
		expect(entities.length).toBe(1);

		// These queries should be hashed the same.
		expect(world[$queriesHashMap].size).toBe(1);
	});

	it('should correctly populate Added queries when components are added', () => {
		const Added = createAdded();

		const entityA = world.create();
		const entityB = world.create();
		const entityC = world.create();

		let entities: readonly number[] = [];

		entities = world.query(Added(Foo));
		expect(entities.length).toBe(0);

		world.add(entityA, Foo);
		entities = world.query(Added(Foo));
		expect(entities).toEqual([entityA]);

		// The query gets drained and should be empty when run again.
		entities = world.query(Added(Foo));
		expect(entities.length).toBe(0);

		world.add(entityB, Foo);
		entities = world.query(Added(Foo));
		expect(entities).toEqual([entityB]);

		// And a static query should give both entities.
		entities = world.query(Foo);
		expect(entities).toEqual([entityA, entityB]);

		// Should not be added to the query if the component is removed before it is read.
		world.add(entityC, Foo);
		world.remove(entityC, Foo);
		entities = world.query(Added(Foo));
		expect(entities.length).toBe(0);

		// But if it is removed and added again in the same frame it should be recorded.
		world.remove(entityA, Foo);
		world.add(entityA, Foo);
		entities = world.query(Added(Foo));
		expect(entities).toEqual([entityA]);

		// Should only populate the query if tracked component is added,
		// even if it matches the query otherwise.
		world.remove(entityA, Foo, Bar); // Quick reset
		world.add(entityA, Foo);
		world.query(Added(Foo)); // Drain query

		world.add(entityA, Bar);
		entities = world.query(Added(Foo));
		expect(entities.length).toBe(0); // Fails for Added
		entities = world.query(Foo, Bar);
		expect(entities).toEqual([entityA]); // But matches static query
	});

	it('should properly populate Added queries with mulitple tracked components', () => {
		const Added = createAdded();

		const entityA = world.create();
		const entityB = world.create();

		let entities = world.query(Added(Foo, Bar));
		expect(entities.length).toBe(0);

		world.add(entityA, Foo);
		entities = world.query(Added(Foo, Bar));
		expect(entities.length).toBe(0);

		world.add(entityA, Bar);
		entities = world.query(Added(Foo, Bar));
		expect(entities).toEqual([entityA]);

		world.add(entityB, Foo);
		entities = world.query(Added(Foo, Bar));
		expect(entities.length).toBe(0);

		world.add(entityB, Bar);
		entities = world.query(Added(Foo, Bar));
		expect(entities).toEqual([entityB]);
	});

	it('should track multiple Added modifiers independently', () => {
		const Added = createAdded();
		const Added2 = createAdded();

		const entityA = world.create();
		const entityB = world.create();

		let entities = world.query(Added(Foo));
		expect(entities.length).toBe(0);

		let entities2 = world.query(Added2(Foo));
		expect(entities2.length).toBe(0);

		world.add(entityA, Foo);
		entities = world.query(Added(Foo));
		expect(entities.length).toBe(1);

		world.remove(entityB, Foo);
		world.add(entityB, Foo);
		entities = world.query(Added(Foo));
		entities2 = world.query(Added2(Foo));

		expect(entities.length).toBe(1);
		expect(entities2.length).toBe(2);
	});

	it('should populate Added queries even if they are registered after the component is added', () => {
		const Added = createAdded();

		const entityA = world.create(Foo);
		const entityB = world.create(Foo, Bar);

		let entities = world.query(Added(Foo));
		expect(entities).toEqual([entityA, entityB]);

		entities = world.query(Added(Foo, Bar));
		expect(entities).toEqual([entityB]);

		const LaterAdded = createAdded();

		let entities2 = world.query(LaterAdded(Foo));
		expect(entities2.length).toBe(0);

		world.remove(entityA, Foo); // Reset
		world.add(entityA, Foo);
		entities = world.query(Added(Foo));
		entities2 = world.query(LaterAdded(Foo));

		expect(entities.length).toBe(1);
		expect(entities2.length).toBe(1);
	});

	it('should combine Not and Added modifiers with logical AND', () => {
		const Added = createAdded();

		const entityA = world.create();
		const entityB = world.create();

		// No entities should match this query since while Not will match
		// all empty entities, Added will only match entities that have Foo.
		let entities = world.query(Added(Foo), Not(Bar));
		expect(entities.length).toBe(0);

		// Adding Foo to entityA should match the query as it has Foo added and not Bar.
		world.add(entityA, Foo);
		entities = world.query(Added(Foo), Not(Bar));
		expect(entities).toEqual([entityA]);

		// Adding Foo and Bar to entityB should not match the query as it has Bar.
		world.add(entityB, Foo, Bar);
		entities = world.query(Added(Foo), Not(Bar));
		expect(entities.length).toBe(0);
	});

	it('should properly populate Removed queries when components are removed', () => {
		const Removed = createRemoved();

		const entityA = world.create();
		const entityB = world.create();

		let entities = world.query(Removed(Foo));
		expect(entities.length).toBe(0);

		world.add(entityA, Foo);
		world.add(entityB, Foo);
		entities = world.query(Removed(Foo));
		expect(entities.length).toBe(0);

		world.remove(entityA, Foo);
		entities = world.query(Removed(Foo));
		expect(entities).toEqual([entityA]);

		// Should work with components added and removed in the same frame.
		world.add(entityA, Foo);
		world.remove(entityA, Foo);
		entities = world.query(Removed(Foo));
		expect(entities).toEqual([entityA]);

		// Should track between Removed modifiers independently.
		const Removed2 = createRemoved();

		let entities2 = world.query(Removed2(Foo));
		expect(entities2.length).toBe(0);

		world.add(entityA, Foo);
		world.remove(entityA, Foo);
		entities = world.query(Removed(Foo));
		expect(entities.length).toBe(1);

		world.add(entityB, Foo);
		world.remove(entityB, Foo);
		entities = world.query(Removed(Foo));
		entities2 = world.query(Removed2(Foo));

		expect(entities.length).toBe(1);
		expect(entities2.length).toBe(2);
	});

	it('should populate Removed queries even if they are registered after the component is removed', () => {
		const Removed = createRemoved();

		const entity = world.create(Foo);
		world.remove(entity, Foo);

		let entities = world.query(Removed(Foo));
		expect(entities).toEqual([entity]);

		world.add(entity, Foo); // Reset

		const LaterRemoved = createRemoved();

		let entities2 = world.query(LaterRemoved(Foo));
		expect(entities2.length).toBe(0);

		world.remove(entity, Foo);
		entities = world.query(Removed(Foo));
		entities2 = world.query(LaterRemoved(Foo));

		expect(entities.length).toBe(1);
		expect(entities2.length).toBe(1);
	});

	it('should combine Not and Removed modifiers with logical AND', () => {
		const Removed = createRemoved();

		const entityA = world.create();
		const entityB = world.create();

		// Initially, no entities should match the query because no entities
		// have Foo removed even though Not matches all empty entities.
		let entities = world.query(Removed(Foo), Not(Bar));
		expect(entities.length).toBe(0);

		// Add Foo to entityA, then it should not match as it hasn't been removed yet.
		world.add(entityA, Foo);
		entities = world.query(Removed(Foo), Not(Bar));
		expect(entities.length).toBe(0);

		// Add Foo and Bar to entityB, it also should not match as
		// Foo hasn't been removed and it has Bar.
		world.add(entityB, Foo, Bar);
		entities = world.query(Removed(Foo), Not(Bar));
		expect(entities.length).toBe(0);

		// Remove Foo from entityA, it should now match as Foo is removed and
		// it does not have Bar.
		world.remove(entityA, Foo);
		entities = world.query(Removed(Foo), Not(Bar));
		expect(entities).toEqual([entityA]);

		// Remove Foo from entityB, it should still not match as it has Bar.
		world.remove(entityB, Foo);
		entities = world.query(Removed(Foo), Not(Bar));
		expect(entities.length).toBe(0);
	});

	it('should combine Added and Removed modifiers with logical AND', () => {
		const Added = createAdded();
		const Removed = createRemoved();

		const entityA = world.create();
		const entityB = world.create();

		let entities = world.query(Added(Foo), Removed(Bar));
		expect(entities.length).toBe(0);

		// Add Foo to entityA and Bar to entityB.
		// Neither entity should match the query.
		world.add(entityA, Foo);
		world.add(entityB, Bar);
		entities = world.query(Added(Foo), Removed(Bar));
		expect(entities.length).toBe(0);

		// Remove Foo from entityA and remove Bar from entityB.
		// Neither entity should match the query.
		world.remove(entityA, Foo);
		world.remove(entityB, Bar);
		entities = world.query(Added(Foo), Removed(Bar));
		expect(entities.length).toBe(0);

		// Add Foo and Bar to entityA, then remove Bar.
		// This entity should now match the query.
		world.add(entityA, Foo, Bar);
		world.remove(entityA, Bar);
		entities = world.query(Added(Foo), Removed(Bar));
		expect(entities).toEqual([entityA]);

		// Resets and can fill again.
		world.remove(entityA, Foo);
		world.add(entityA, Foo);
		entities = world.query(Added(Foo), Removed(Bar));
		expect(entities).toEqual([entityA]);

		// Add Foo to entityB and remove Bar.
		// This entity should now match the query.
		world.add(entityB, Foo, Bar);
		world.remove(entityB, Bar);
		entities = world.query(Added(Foo), Removed(Bar));
		expect(entities).toEqual([entityB]);

		// Make sure changes in one entity do not leak to the other.
		const entityC = world.create();
		const entityD = world.create();

		world.add(entityC, Foo);
		world.add(entityD, Bar);
		world.remove(entityD, Bar);

		entities = world.query(Added(Foo), Removed(Bar));
		expect(entities.length).toBe(0);
	});

	it('should properly populate Changed queries when components are changed', () => {
		const Changed = createChanged();

		const entityA = world.create();

		let entities = world.query(Changed(Position));
		expect(entities.length).toBe(0);

		world.add(entityA, Position);
		entities = world.query(Changed(Position));
		expect(entities.length).toBe(0);

		const positions = world.get(Position);
		positions.x[entityA] = 10;
		positions.y[entityA] = 20;

		// Set changed should populate the query.
		world.changed(entityA, Position);
		entities = world.query(Changed(Position));
		expect(entities).toEqual([entityA]);

		// Querying again should not return the entity.
		entities = world.query(Changed(Position));
		expect(entities.length).toBe(0);

		// Should not populate the query if the component is removed.
		world.remove(entityA, Position);
		world.changed(entityA, Position);
		entities = world.query(Changed(Position));
		expect(entities.length).toBe(0);
	});

	it('should populate Changed queries even if they are registered after the component is changed', () => {
		const Changed = createChanged();

		const entity = world.create(Position);

		const positions = world.get(Position);
		positions.x[entity] = 10;
		positions.y[entity] = 20;
		world.changed(entity, Position);

		let entities = world.query(Changed(Position));
		expect(entities).toEqual([entity]);

		const LaterChanged = createChanged();

		let entities2 = world.query(LaterChanged(Position));
		expect(entities2.length).toBe(0);

		positions.x[entity] = 30;
		positions.y[entity] = 40;
		world.changed(entity, Position);

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
		const entity = world.create();

		world.query.subscribe([Position, Foo], staticCb);

		world.add(entity, Position);
		expect(staticCb).toHaveBeenCalledTimes(0);

		world.add(entity, Foo);
		expect(staticCb).toHaveBeenCalledTimes(1);
		expect(event.type).toBe('add');
		expect(event.entity).toBe(entity);

		world.remove(entity, Foo, Position);
		expect(staticCb).toHaveBeenCalledTimes(2);
		expect(event.type).toBe('remove');
		expect(event.entity).toBe(entity);

		// Added query subscriptions.
		// This acts the same as a static query since we
		// get a stream of matching if the components were added.
		const trackingCb = vi.fn();
		const Added = createAdded();

		world.query.subscribe([Added(Foo)], trackingCb);

		world.add(entity, Foo);
		expect(trackingCb).toHaveBeenCalledTimes(1);
		expect(trackingCb).toHaveBeenCalledWith('add', entity);

		world.remove(entity, Foo);
		expect(trackingCb).toHaveBeenCalledTimes(2);
		expect(trackingCb).toHaveBeenCalledWith('remove', entity);

		// Removed query subscriptions.
		const Removed = createRemoved();
		const removedCb = vi.fn();

		world.query.subscribe([Removed(Foo)], removedCb);

		world.add(entity, Foo);
		expect(removedCb).toHaveBeenCalledTimes(0);

		world.remove(entity, Foo);
		expect(removedCb).toHaveBeenCalledTimes(1);
		expect(removedCb).toHaveBeenCalledWith('add', entity);

		world.add(entity, Foo);
		expect(removedCb).toHaveBeenCalledTimes(2);
		expect(removedCb).toHaveBeenCalledWith('remove', entity);
	});

	it('can subscribe to changes on a specific component', () => {
		const entity = world.create(Position);

		const cb = vi.fn();
		const unsub = world.changed.subscribe(Position, cb);

		const positions = world.get(Position);
		positions.x[entity] = 10;
		positions.y[entity] = 20;

		world.changed(entity, Position);

		expect(cb).toHaveBeenCalledTimes(1);
		expect(cb).toHaveBeenCalledWith(entity);

		unsub();

		positions.x[entity] = 30;
		positions.y[entity] = 40;

		world.changed(entity, Position);

		expect(cb).toHaveBeenCalledTimes(1);

		world.changed(entity, Name);

		expect(cb).toHaveBeenCalledTimes(1);
	});
});
