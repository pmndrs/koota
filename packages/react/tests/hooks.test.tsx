import {
	createActions,
	createWorld,
	Entity,
	QueryResult,
	trait,
	TraitInstance,
	universe,
	World,
} from '@koota/core';
import ReactThreeTestRenderer from '@react-three/test-renderer';
import { act, StrictMode, useEffect, useState } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useActions, useQuery, WorldProvider } from '../src';
import { useTrait } from '../src/hooks/use-trait';

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

	it('useTrait with entity', async () => {
		const entity = world.spawn(Position);
		let position: TraitInstance<typeof Position> | undefined = undefined;

		function Test() {
			position = useTrait(entity, Position);
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

	it('useTrait with entity at effect time', async () => {
		const dummyEntity = world.spawn();
		let entity: Entity | undefined = undefined;
		let position: TraitInstance<typeof Position> | undefined = undefined;

		function Test() {
			const [, set] = useState(0);

			// Rerender to ensure the entity is not stale for useTrait
			useEffect(() => {
				entity = world.spawn(Position);
				set((v) => v + 1);
			}, []);

			position = useTrait(entity ?? dummyEntity, Position);
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

		console.log('position', position);

		expect(position).toEqual({ x: 0, y: 0 });

		await act(async () => {
			entity!.set(Position, { x: 1, y: 1 });
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

	it('useTrait with world', async () => {
		const TimeOfDay = trait({ hour: 0 });
		world.add(TimeOfDay);
		let timeOfDay: TraitInstance<typeof TimeOfDay> | undefined = undefined;

		function Test() {
			timeOfDay = useTrait(world, TimeOfDay);
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

	it('useActions', async () => {
		const actions = createActions((world) => ({
			spawnBody: () => world.spawn(Position),
		}));

		let spawnedEntity: Entity | undefined = undefined;

		function Test() {
			const { spawnBody } = useActions(actions);
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
});
