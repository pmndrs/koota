import { createWorld, universe, type World } from '@koota/core';
import { render } from '@testing-library/react';
import { act, StrictMode } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useWorld, WorldProvider } from '../src';

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
			render(
				<StrictMode>
					<WorldProvider world={world}>
						<Test />
					</WorldProvider>
				</StrictMode>
			);
		});

		expect(worldTest).toBe(world);
	});
});
