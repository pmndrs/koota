import { createWorld, Entity, QueryResult, trait, TraitInstance, universe, World } from '@koota/core';
import ReactThreeTestRenderer from '@react-three/test-renderer';
import { act, StrictMode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useQuery, WorldProvider } from '../src';
import { createActions } from '../src/actions/create-actions';
import { useEntityRef } from '../src/hooks/use-entity-ref';
import { useObserve } from '../src/hooks/use-observe';

declare global {
	var IS_REACT_ACT_ENVIRONMENT: boolean;
}

// Let React know that we'll be testing effectful components
global.IS_REACT_ACT_ENVIRONMENT = true;

let world: World;
const Position = trait({ x: 0, y: 0 });

describe('Hooks', () => {
	beforeEach(() => {
		universe.reset();
		world = createWorld();
	});

	it('useObserve with entity', async () => {
		const entity = world.spawn(Position);
		let position: TraitInstance<typeof Position> | undefined = undefined;

		function Test() {
			position = useObserve(entity, Position);
			return null;
		}

		let renderer: any;

		await act(async () => {
			renderer = await ReactThreeTestRenderer.create(
				<StrictMode>
					<WorldProvider world={world}>
						<Test />
					</WorldProvider>
				</StrictMode>
			);
		});

		expect(position).toEqual({ x: 0, y: 0 });

		await act(async () => {
			entity.set(Position, { x: 1, y: 1 });
			await renderer!.update(
				<StrictMode>
					<WorldProvider world={world}>
						<Test />
					</WorldProvider>
				</StrictMode>
			);
		});

		expect(position).toEqual({ x: 1, y: 1 });
	});

	it.only('useObserve with world', async () => {
		const TimeOfDay = trait({ hour: 0 });
		world.add(TimeOfDay);
		let timeOfDay: TraitInstance<typeof TimeOfDay> | undefined = undefined;

		function Test() {
			timeOfDay = useObserve(world, TimeOfDay);
			return null;
		}

		let renderer: any;

		await act(async () => {
			renderer = await ReactThreeTestRenderer.create(
				<StrictMode>
					<WorldProvider world={world}>
						<Test />
					</WorldProvider>
				</StrictMode>
			);
		});

		expect(timeOfDay).toEqual({ hour: 0 });

		await act(async () => {
			world.set(TimeOfDay, { hour: 1 });

			await renderer!.update(
				<StrictMode>
					<WorldProvider world={world}>
						<Test />
					</WorldProvider>
				</StrictMode>
			);
		});

		expect(timeOfDay).toEqual({ hour: 1 });
	});

	it('useQuery', async () => {
		let entities: QueryResult<[typeof Position]> = null!;

		let entityA: Entity;
		let entityB: Entity;
		let entityC: Entity;

		function Test() {
			entities = useQuery(Position);
			return null;
		}

		let renderer: any;

		await act(async () => {
			entityA = world.spawn(Position);

			renderer = await ReactThreeTestRenderer.create(
				<StrictMode>
					<WorldProvider world={world}>
						<Test />
					</WorldProvider>
				</StrictMode>
			);
		});

		expect(entities.length).toBe(1);

		await act(async () => {
			entityB = world.spawn(Position);
			entityC = world.spawn(Position);
			world.spawn(Position);

			await renderer!.update(
				<StrictMode>
					<WorldProvider world={world}>
						<Test />
					</WorldProvider>
				</StrictMode>
			);
		});

		expect(entities.length).toBe(4);

		await act(async () => {
			entityA.destroy();
			entityB.destroy();
			entityC.destroy();

			await renderer!.update(
				<StrictMode>
					<WorldProvider world={world}>
						<Test />
					</WorldProvider>
				</StrictMode>
			);
		});

		expect(entities.length).toBe(1);
	});

	it('creates actions hook', async () => {
		const useActions = createActions((world) => ({
			spawnBody: () => world.spawn(Position),
		}));

		let spawnedEntity: Entity | undefined = undefined;

		function Test() {
			const { spawnBody } = useActions();
			spawnedEntity = spawnBody();
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

		expect(spawnedEntity).toBeDefined();
	});

	it('useEntityRef', async () => {
		const mock = vi.fn();

		const Ref = trait({ value: null! });

		function Test() {
			const entityRef = useEntityRef((mesh, entity) => {
				expect(mesh.isMesh).toBe(true);
				entity.add(Ref({ value: mesh }));
				mock();
			});
			return <mesh ref={entityRef} />;
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

		expect(mock).toHaveBeenCalledTimes(1);
	});
});
