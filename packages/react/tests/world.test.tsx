import { universe, World } from '@koota/core';
import { beforeEach, describe, expect, it } from 'vitest';
import { createWorld } from '@koota/core';
import { getDefaultWorld, useWorld, WorldProvider } from '../src';
import ReactThreeTestRenderer from '@react-three/test-renderer';
import { act, StrictMode } from 'react';

declare global {
	var IS_REACT_ACT_ENVIRONMENT: boolean;
}

// Let React know that we'll be testing effectful components
global.IS_REACT_ACT_ENVIRONMENT = true;

let world: World;

describe('World', () => {
	beforeEach(() => {
		universe.reset();
		world = createWorld();
	});

	it('provides a world to its children', async () => {
		let worldTest: World | null = null;

		function Test() {
			worldTest = useWorld();
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

		expect(worldTest).toBe(world);
	});

	it('provides the default world if no world is provided', async () => {
		let worldTest: World | null = null;

		function Test() {
			worldTest = useWorld();
			return null;
		}

		await act(async () => {
			await ReactThreeTestRenderer.create(<Test />);
		});

		expect(worldTest).toBe(getDefaultWorld());
	});
});
