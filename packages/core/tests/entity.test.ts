import { beforeEach, describe, expect, it } from 'vitest';
import { World } from '../world/world';
import { $entityCursor, $entitySparseSet, $recyclingBin, $removed } from '../world/symbols';
import { define } from '../component/component';

const Foo = define();
const Bar = define();

describe('Entity', () => {
	const world = new World();
	world.init();

	beforeEach(() => {
		world.reset();
	});

	it('should create and destroy an entity', () => {
		const entityA = world.create();
		expect(entityA).toBe(0);
		expect(world[$entitySparseSet].dense.length).toBe(1);
		expect(world[$entityCursor]).toBe(1);

		const entityB = world.create();
		expect(entityB).toBe(1);
		expect(world[$entitySparseSet].dense.length).toBe(2);
		expect(world[$entityCursor]).toBe(2);

		const entityC = world.create();
		expect(entityC).toBe(2);
		expect(world[$entitySparseSet].dense.length).toBe(3);
		expect(world[$entityCursor]).toBe(3);

		world.destroy(entityA);
		world.destroy(entityC);
		world.destroy(entityB);

		expect(world[$entitySparseSet].dense.length).toBe(0);

		const recyclingBin = world[$recyclingBin];
		expect(recyclingBin.length).toBe(3);
		expect(recyclingBin[0]).toBe(0);
		expect(recyclingBin[1]).toBe(2);
		expect(recyclingBin[2]).toBe(1);
	});

	it('should recycle entities', () => {
		const entities: number[] = [];

		for (let i = 0; i < 1500; i++) {
			entities.push(world.create());
		}

		expect(world[$entitySparseSet].dense.length).toBe(1500);
		expect(world[$entityCursor]).toBe(1500);

		for (const entity of entities) {
			world.destroy(entity);
		}

		world.recycle();

		expect(world[$recyclingBin].length).toBe(0);
		expect(world[$removed].length).toBe(1500);

		let entity = world.create();
		expect(entity).toBe(0);

		entity = world.create();
		expect(entity).toBe(1);

		entity = world.create();
		expect(entity).toBe(2);
	});

	it('should add entities with create', () => {
		const entity = world.create(Foo, Bar);

		expect(world.has(entity, Foo)).toBe(true);
		expect(world.has(entity, Bar)).toBe(true);
	});
});
