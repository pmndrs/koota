import { createActions, createWorld, type Entity, trait, universe, type World } from '../../dist';
import { render } from '@testing-library/react';
import { act, StrictMode } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useActions, WorldProvider } from '../../react';

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

		let spawnedEntity: Entity | undefined ;

		function Test() {
			const { spawnBody } = useActions(actions);
			spawnedEntity = spawnBody();
			return null;
		}

		await act(async () => {
			render(
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
