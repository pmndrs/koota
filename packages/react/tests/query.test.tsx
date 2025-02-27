import { createWorld, Entity, QueryResult, trait, universe, World } from '@koota/core';
import ReactThreeTestRenderer from '@react-three/test-renderer';
import { act, ReactNode, StrictMode } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useQuery, WorldProvider } from '../src';
import exp from 'constants';

declare global {
	var IS_REACT_ACT_ENVIRONMENT: boolean;
}

// Let React know that we'll be testing effectful components
global.IS_REACT_ACT_ENVIRONMENT = true;

let world: World;
const Position = trait({ x: 0, y: 0 });
const Velocity = trait({ x: 0, y: 0 });

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

	it('captures entities added during effect timing', async () => {
		// Spawn an initial entity
		world.spawn(Position);

		let entities: QueryResult<[typeof Position]> = null!;

		function Test() {
			entities = useQuery(Position);
			return null;
		}

		// Spawn an entity in the ref callback, which is after the
		// render function but before effects run
		function EntityAdder() {
			return (
				<mesh
					ref={() => {
						world.spawn(Position);
					}}
				/>
			);
		}

		await act(async () => {
			await ReactThreeTestRenderer.create(
				<StrictMode>
					<WorldProvider world={world}>
						<Test />
						<EntityAdder />
					</WorldProvider>
				</StrictMode>
			);
		});

		expect(entities.length).toBe(2);
	});

	it('renders once if entities do not change before effect', async () => {
		// Spawn an initial entity
		world.spawn(Position);

		let entities: QueryResult<[typeof Position]> = null!;
		let renderCount = 0;

		function Test() {
			entities = useQuery(Position);
			renderCount++;
			return null;
		}

		// Test without strict mode
		await act(async () => {
			await ReactThreeTestRenderer.create(
				<WorldProvider world={world}>
					<Test />
				</WorldProvider>
			);
		});

		expect(renderCount).toBe(1);
	});

	it('renders twice if entities change before effect', async () => {
		// Spawn Two initial entities
		const entity = world.spawn(Position);
		world.spawn(Position);

		let entities: QueryResult<[typeof Position]> = null!;
		let renderCount = 0;

		function Test() {
			entities = useQuery(Position);
			renderCount++;
			return null;
		}

		// Add and remove an entity so the total number
		// is the same but the contents change
		function EntityAdder() {
			return (
				<mesh
					ref={() => {
						world.spawn(Position);
						entity.destroy();
					}}
				/>
			);
		}

		await act(async () => {
			await ReactThreeTestRenderer.create(
				<WorldProvider world={world}>
					<Test />
					<EntityAdder />
				</WorldProvider>
			);
		});

		expect(renderCount).toBe(2);
	});

	// it('updates when query parameters change', async () => {
	// 	// Create entities with different traits
	// 	const positionEntity = world.spawn(Position);
	// 	const bothEntity = world.spawn(Position, Velocity);

	// 	let entities: QueryResult<any> = null!;
	// 	let queryParams: any[] = [Position];
	// 	let rerender: () => Promise<void>;

	// 	function Test() {
	// 		entities = useQuery(...queryParams);
	// 		return null;
	// 	}

	// 	// Render with initial parameters
	// 	await act(async () => {
	// 		const renderer = await ReactThreeTestRenderer.create(
	// 			<StrictMode>
	// 				<WorldProvider world={world}>
	// 					<Test />
	// 				</WorldProvider>
	// 			</StrictMode>
	// 		);

	// 		rerender = async () => {
	// 			await renderer.update(
	// 				<StrictMode>
	// 					<WorldProvider world={world}>
	// 						<Test />
	// 					</WorldProvider>
	// 				</StrictMode>
	// 			);
	// 		};
	// 	});

	// 	// Should have both entities with Position
	// 	expect(entities.length).toBe(2);
	// 	expect(entities).toContain(positionEntity);
	// 	expect(entities).toContain(bothEntity);

	// 	// Change query parameters
	// 	await act(async () => {
	// 		queryParams = [Position, Velocity];
	// 		await rerender();
	// 	});

	// 	// Should now only have the entity with both Position and Velocity
	// 	expect(entities.length).toBe(1);
	// 	expect(entities[0]).toBe(bothEntity);
	// });
});
