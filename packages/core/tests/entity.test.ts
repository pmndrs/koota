import { beforeEach, describe, expect, it } from 'vitest';
import { createWorld } from '../src';
import { define } from '../src/component/component';
import { unpackEntity } from '../src/entity/utils/pack-entity';
import { Entity } from '../src/entity/types';

const Foo = define();
const Bar = define();

describe('Entity', () => {
	const world = createWorld();

	beforeEach(() => {
		world.reset();
	});

	it('should create and destroy an entity', () => {
		const entityA = world.spawn();
		expect(entityA).toBe(0);

		const entityB = world.spawn();
		expect(entityB).toBe(1);

		const entityC = world.spawn();
		expect(entityC).toBe(2);

		entityA.destroy();
		entityC.destroy();
		entityB.destroy();

		expect(world.entities.length).toBe(0);
	});

	it('should encode world ID in entity', () => {
		const entity = world.spawn();
		const { worldId, entityId } = unpackEntity(entity);

		expect(worldId).toBe(world.id);
		expect(entityId).toBe(0);

		const world2 = createWorld();
		const entity2 = world2.spawn();
		const { worldId: worldId2, entityId: entityId2 } = unpackEntity(entity2);

		expect(worldId2).toBe(world2.id);
		expect(entityId2).toBe(0);
	});

	it('should recycle entities and increment generation', () => {
		const entities: Entity[] = [];

		for (let i = 0; i < 500; i++) {
			entities.push(world.spawn());
		}

		for (const entity of entities) {
			entity.destroy();
		}

		// IDs are recycled in reverse order.
		let entity = world.spawn();
		let { generation, entityId } = unpackEntity(entity);
		expect(generation).toBe(1);
		expect(entityId).toBe(499);

		entity = world.spawn();
		({ generation, entityId } = unpackEntity(entity));
		expect(generation).toBe(1);
		expect(entityId).toBe(498);

		entity = world.spawn();
		({ generation, entityId } = unpackEntity(entity));
		expect(generation).toBe(1);
		expect(entityId).toBe(497);
	});

	it('should add entities with create', () => {
		const entity = world.spawn(Foo, Bar);

		expect(entity.has(Foo)).toBe(true);
		expect(entity.has(Bar)).toBe(true);
	});

	it('can add components', () => {
		const entity = world.spawn();

		entity.add(Foo, Bar);

		expect(entity.has(Foo)).toBe(true);
		expect(entity.has(Bar)).toBe(true);
	});

	it('can remove components', () => {
		const entity = world.spawn(Foo, Bar);

		entity.remove(Foo);

		expect(entity.has(Foo)).toBe(false);
		expect(entity.has(Bar)).toBe(true);
	});
});
