import { createActions, createWorld, Entity, trait, universe, World } from '@koota/core';
import ReactThreeTestRenderer from '@react-three/test-renderer';
import { act, StrictMode } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useActions, WorldProvider } from '../src';

declare global {
	var IS_REACT_ACT_ENVIRONMENT: boolean;
}

// Let React know that we'll be testing effectful components
global.IS_REACT_ACT_ENVIRONMENT = true;

let world: World;
const Position = trait({ x: 0, y: 0 });

describe('useActions', () => {
	beforeEach(() => {
		universe.reset();
		world = createWorld();
	});

	it('returns actions bound to the world in context', async () => {
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
