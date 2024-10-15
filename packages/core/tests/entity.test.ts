import { beforeEach, describe, expect, it } from 'vitest';
import { createWorld } from '../src';
import { trait, getStores } from '../src/trait/trait';
import { Entity } from '../src/entity/types';
import { unpackEntity } from '../src/entity/utils/pack-entity';

const Foo = trait();
const Bar = trait({ value: 0 });

describe('Entity', () => {
	const world = createWorld();

	beforeEach(() => {
		world.reset();
	});

	it('should create and destroy an entity', () => {
		const entityA = world.spawn();
		expect(entityA).toBe(1);

		const entityB = world.spawn();
		expect(entityB).toBe(2);

		const entityC = world.spawn();
		expect(entityC).toBe(3);

		entityA.destroy();
		entityC.destroy();
		entityB.destroy();

		expect(world.entities.length).toBe(1);
	});

	it('should encode world ID in entity', () => {
		const entity = world.spawn();
		const { worldId, entityId } = unpackEntity(entity);

		expect(worldId).toBe(world.id);
		expect(entityId).toBe(1);

		const world2 = createWorld();
		const entity2 = world2.spawn();
		const { worldId: worldId2, entityId: entityId2 } = unpackEntity(entity2);

		expect(worldId2).toBe(world2.id);
		expect(entityId2).toBe(1);
	});

	it('should recycle entities and increment generation', () => {
		const entities: Entity[] = [];

		for (let i = 0; i < 50; i++) {
			entities.push(world.spawn(Bar));
		}

		const bar = getStores(world, Bar);

		// Length should be 50 + 1 (world entity).
		expect(bar.value.length).toBe(51);

		for (const entity of entities) {
			entity.destroy();
		}

		// IDs are recycled in reverse order.
		let entity = world.spawn(Bar);
		let { generation, entityId } = unpackEntity(entity);
		expect(generation).toBe(1);
		expect(entityId).toBe(50);

		entity = world.spawn(Bar);
		({ generation, entityId } = unpackEntity(entity));
		expect(generation).toBe(1);
		expect(entityId).toBe(49);

		entity = world.spawn(Bar);
		({ generation, entityId } = unpackEntity(entity));
		expect(generation).toBe(1);
		expect(entityId).toBe(48);

		// Should remain the same and not increase because of the entity encoding.
		expect(bar.value.length).toBe(51);
	});

	it('should add entities with spawn', () => {
		const entity = world.spawn(Foo, Bar);

		expect(entity.has(Foo)).toBe(true);
		expect(entity.has(Bar)).toBe(true);
	});

	it('can add traits', () => {
		const entity = world.spawn();

		entity.add(Foo, Bar);

		expect(entity.has(Foo)).toBe(true);
		expect(entity.has(Bar)).toBe(true);
	});

	it('can remove traits', () => {
		const entity = world.spawn(Foo, Bar);

		entity.remove(Foo);

		expect(entity.has(Foo)).toBe(false);
		expect(entity.has(Bar)).toBe(true);
	});

	it('can get trait state', () => {
		const entity = world.spawn(Bar({ value: 1 }));
		const bar = entity.get(Bar);
		expect(bar.value).toBe(1);

		// Changing trait state should not affect the entity.
		bar.value = 2;
		expect(entity.get(Bar).value).toBe(1);
	});

	it('can set trait state', () => {
		const entity = world.spawn(Bar);
		entity.set(Bar, { value: 1 });
		expect(entity.get(Bar).value).toBe(1);
	});

	it('should trigger change events when trait state is set', () => {
		const entity = world.spawn(Bar);
		let called = false;
		world.onChange(Bar, () => (called = true));
		entity.set(Bar, { value: 1 });
		expect(called).toBe(true);

		// Can optionally suppress the event.
		called = false;
		entity.set(Bar, { value: 2 }, false);
		expect(called).toBe(false);
	});
});
