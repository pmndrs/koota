import { beforeEach, describe, expect, it } from 'vitest';
import {
	$internal,
	createAdded,
	createChanged,
	createRemoved,
	createWorld,
	getStore,
	Not,
	trait,
} from '../src';

const Position = trait({ x: 0, y: 0 });
const IsActive = trait();
const Foo = trait();
const Bar = trait();

describe('Query modifiers', () => {
	const world = createWorld();
	world.init();

	beforeEach(() => {
		world.reset();
	});

	it('should correctly populate Not queries when traits are added and removed', () => {
		const entityA = world.spawn();
		const entityB = world.spawn();
		const entityC = world.spawn();

		let entities: any = world.query(Foo);
		expect(entities.length).toBe(0);

		entities = world.query(Not(Foo));
		expect(entities[0]).toBe(entityA);
		expect(entities[1]).toBe(entityB);
		expect(entities[2]).toBe(entityC);

		// Add
		entityA.add(Foo);
		entityB.add(Bar);
		entityC.add(Foo, Bar);

		entities = world.query(Foo);
		expect(entities[0]).toBe(entityA);
		expect(entities[1]).toBe(entityC);

		entities = world.query(Foo, Bar);
		expect(entities[0]).toBe(entityC);

		entities = world.query(Not(Foo));
		expect(entities[0]).toBe(entityB);

		// Remove
		entityA.remove(Foo);

		entities = world.query(Foo);
		expect(entities[0]).toBe(entityC);

		entities = world.query(Not(Foo));
		expect(entities[0]).toBe(entityB);
		expect(entities[1]).toBe(entityA);

		entities = world.query(Not(Foo), Not(Bar));
		expect(entities[0]).toBe(entityA);

		// Remove more so entity A and C have no traits
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

		let entities: any = world.query(Not(Foo), Not(Bar));
		expect(entities.length).toBe(1);

		entities = world.query(Not(Foo, Bar));
		expect(entities.length).toBe(1);

		// These queries should be hashed the same.
		expect(ctx.queriesHashMap.size).toBe(1);
	});

	it('should correctly populate Added queries when traits are added', () => {
		const Added = createAdded();

		const entityA = world.spawn();
		const entityB = world.spawn();
		const entityC = world.spawn();

		let entities: readonly number[] = [];

		entities = world.query(Added(Foo));
		expect(entities.length).toBe(0);

		entityA.add(Foo);
		entities = world.query(Added(Foo));
		expect(entities[0]).toBe(entityA);

		// The query gets drained and should be empty when run again.
		entities = world.query(Added(Foo));
		expect(entities.length).toBe(0);

		entityB.add(Foo);
		entities = world.query(Added(Foo));
		expect(entities[0]).toBe(entityB);

		// And a static query should give both entities.
		entities = world.query(Foo);
		expect(entities[0]).toBe(entityA);
		expect(entities[1]).toBe(entityB);

		// Should not be added to the query if the trait is removed before it is read.
		entityC.add(Foo);
		entityC.remove(Foo);
		entities = world.query(Added(Foo));
		expect(entities.length).toBe(0);

		// But if it is removed and added again in the same frame it should be recorded.
		entityA.remove(Foo);
		entityA.add(Foo);
		entities = world.query(Added(Foo));
		expect(entities[0]).toBe(entityA);

		// Should only populate the query if tracked trait is added,
		// even if it matches the query otherwise.
		entityA.remove(Foo, Bar); // Quick reset
		entityA.add(Foo);
		world.query(Added(Foo)); // Drain query

		entityA.add(Bar);
		entities = world.query(Added(Foo));
		expect(entities.length).toBe(0); // Fails for Added
		entities = world.query(Foo, Bar);
		expect(entities[0]).toBe(entityA); // But matches static query
	});

	it('should properly populate Added queries with mulitple tracked traits', () => {
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
		expect(entities[0]).toBe(entityA);

		entityB.add(Foo);
		entities = world.query(Added(Foo, Bar));
		expect(entities.length).toBe(0);

		entityB.add(Bar);
		entities = world.query(Added(Foo, Bar));
		expect(entities[0]).toBe(entityB);
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

	it('should populate Added queries even if they are registered after the trait is added', () => {
		const Added = createAdded();

		const entityA = world.spawn(Foo);
		const entityB = world.spawn(Foo, Bar);

		let entities: any = world.query(Added(Foo));
		expect(entities[0]).toBe(entityA);
		expect(entities[1]).toBe(entityB);

		entities = world.query(Added(Foo, Bar));
		expect(entities[0]).toBe(entityB);

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
		expect(entities[0]).toBe(entityA);

		// Adding Foo and Bar to entityB should not match the query as it has Bar.
		entityB.add(Foo, Bar);
		entities = world.query(Added(Foo), Not(Bar));
		expect(entities.length).toBe(0);
	});

	it('should properly populate Removed queries when traits are removed', () => {
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
		expect(entities[0]).toBe(entityA);

		// Should work with traits added and removed in the same frame.
		entityA.add(Foo);
		entityA.remove(Foo);
		entities = world.query(Removed(Foo));
		expect(entities[0]).toBe(entityA);
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

	it('should populate Removed queries even if they are registered after the trait is removed', () => {
		const Removed = createRemoved();

		const entity = world.spawn(Foo);
		entity.remove(Foo);

		let entities = world.query(Removed(Foo));
		expect(entities[0]).toBe(entity);

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
		expect(entities[0]).toBe(entityA);

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
		expect(entities[0]).toBe(entityA);

		// Resets and can fill again.
		entityA.remove(Foo);
		entityA.add(Foo);
		entities = world.query(Added(Foo), Removed(Bar));
		expect(entities.length).toBe(0);

		// Add Foo to entityB and remove Bar.
		// This entity should now match the query.
		entityB.add(Foo, Bar);
		entityB.remove(Bar);
		entities = world.query(Added(Foo), Removed(Bar));
		expect(entities[0]).toBe(entityB);

		// Make sure changes in one entity do not leak to the other.
		const entityC = world.spawn();
		const entityD = world.spawn();

		entityC.add(Foo);
		entityD.add(Bar);
		entityD.remove(Bar);

		entities = world.query(Added(Foo), Removed(Bar));
		expect(entities.length).toBe(0);
	});

	it('should properly populate Changed queries when traits are changed', () => {
		const Changed = createChanged();

		const entityA = world.spawn();

		let entities = world.query(Changed(Position));
		expect(entities.length).toBe(0);

		entityA.add(Position);
		entities = world.query(Changed(Position));
		expect(entities.length).toBe(0);

		const positions = getStore(world, Position);
		positions.x[entityA] = 10;
		positions.y[entityA] = 20;

		// Set changed should populate the query.
		entityA.changed(Position);
		entities = world.query(Changed(Position));
		expect(entities[0]).toBe(entityA);

		// Querying again should not return the entity.
		entities = world.query(Changed(Position));
		expect(entities.length).toBe(0);

		// Should not populate the query if the trait is removed.
		entityA.remove(Position);
		entityA.changed(Position);
		entities = world.query(Changed(Position));
		expect(entities.length).toBe(0);
	});

	it('should populate Changed queries even if they are registered after the trait is changed', () => {
		const Changed = createChanged();

		const entity = world.spawn(Position);

		const positions = getStore(world, Position);
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

	it('should only update a Changed query when the tracked trait is changed', () => {
		const entity = world.spawn(Foo, Bar);

		const Changed = createChanged();

		expect(world.queryFirst(Changed(Foo), Changed(Bar))).toBeUndefined();

		entity.changed(Foo);
		entity.changed(Bar);
		expect(world.queryFirst(Changed(Foo), Changed(Bar))).toBe(entity);

		entity.changed(Foo);
		expect(world.queryFirst(Changed(Foo), Changed(Bar))).toBeUndefined();
	});

	// @see https://github.com/pmndrs/koota/issues/115
	it('should not trigger Changed query when removing a different trait', () => {
		const Changed = createChanged();
		const entity = world.spawn(Position);

		// Initial state - no changes
		expect(world.queryFirst(Changed(Position), Not(Foo))).toBeUndefined();

		// Change Position
		entity.changed(Position);
		expect(world.queryFirst(Changed(Position), Not(Foo))).toBe(entity);

		// Query again - should be empty
		expect(world.queryFirst(Changed(Position), Not(Foo))).toBeUndefined();

		// Add and remove Foo - should be empty
		entity.add(Foo);
		entity.remove(Foo);
		expect(world.queryFirst(Changed(Position), Not(Foo))).toBeUndefined();
	});

	it('should correctly populate Changed query when trait changes happen before query initialization', () => {
		// Create change modifier and spawn an entity
		const Changed = createChanged();
		const entity = world.spawn(Foo, Bar);

		// Mark Bar as changed
		entity.changed(Bar);

		// Even if the query wasn't executed before,
		// it should pick up the trait change
		expect(world.queryFirst(Changed(Bar))).toBe(entity);
	});
});
