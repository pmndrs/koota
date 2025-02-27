import { createWorld, Entity, QueryResult, trait, universe, World } from '@koota/core';
import ReactThreeTestRenderer from '@react-three/test-renderer';
import { act, StrictMode } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useQuery, WorldProvider } from '../src';

declare global {
	var IS_REACT_ACT_ENVIRONMENT: boolean;
}

// Let React know that we'll be testing effectful components
global.IS_REACT_ACT_ENVIRONMENT = true;

let world: World;
const Position = trait({ x: 0, y: 0 });

describe('useQuery', () => {
	beforeEach(() => {
		universe.reset();
		world = createWorld();
	});

	it('reactively returns entities matching the query', async () => {
		let entities: QueryResult<[typeof Position]> = null!;

		function Test() {
			entities = useQuery(Position);
			return null;
		}

		await act(async () => {
			await ReactThreeTestRenderer.create(
				<StrictMode>
					<WorldProvider world={world}>
						<Test />
					</WorldProvider>
				</StrictMode>
			);
		});

		expect(entities.length).toBe(0);

		await act(async () => {
			world.spawn(Position);
		});

		expect(entities.length).toBe(1);

		let entityToDestroy: Entity;
		await act(async () => {
			entityToDestroy = world.spawn(Position);
		});

		expect(entities.length).toBe(2);

		await act(async () => {
			entityToDestroy.destroy();
		});

		expect(entities.length).toBe(1);
	});

	it('is stable when the query parameters are the same', async () => {
		const Velocity = trait({ x: 0, y: 0 });
		const Health = trait({ value: 100 });

		let entities: QueryResult = null!;
		let prevEntities: QueryResult = null!;

		function Test({ changeOrder }: { changeOrder: boolean }) {
			entities = useQuery(
				...(changeOrder ? [Position, Velocity, Health] : [Position, Health, Velocity])
			);
			return null;
		}

		await act(async () => {
			await ReactThreeTestRenderer.create(
				<StrictMode>
					<WorldProvider world={world}>
						<Test changeOrder={false} />
					</WorldProvider>
				</StrictMode>
			);
		});

		expect(entities.length).toBe(0);
		prevEntities = entities;

		await act(async () => {
			world.spawn(Position, Velocity, Health);
		});

		expect(entities.length).toBe(1);
		// Test that the entities array is stable when the query parameters are the same
		expect(entities).toBe(prevEntities);
		prevEntities = entities;

		// But unstable when the order of the parameters is different
		await act(async () => {
			await ReactThreeTestRenderer.create(
				<StrictMode>
					<WorldProvider world={world}>
						<Test changeOrder={true} />
					</WorldProvider>
				</StrictMode>
			);
		});

		expect(entities.length).toBe(1);
		expect(entities).not.toBe(prevEntities);
		prevEntities = entities;
	});
});
