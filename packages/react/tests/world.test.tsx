import ReactThreeTestRenderer from '@react-three/test-renderer';
import { createWorld, define, universe } from '@koota/core';
import { StrictMode, Suspense, useLayoutEffect } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useWorld } from '../src/world/use-world';
import { World } from '../src/world/world';

declare global {
	var IS_REACT_ACT_ENVIRONMENT: boolean;
}

// Let React know that we'll be testing effectful components
global.IS_REACT_ACT_ENVIRONMENT = true;

describe('World', () => {
	beforeEach(() => {
		universe.reset();
	});

	it('creates World on mount', async () => {
		let ref: Koota.World | null = null;

		const renderer = await ReactThreeTestRenderer.create(
			<StrictMode>
				<World
					ref={(node) => {
						ref = node;
					}}
				>
					<group />
				</World>
			</StrictMode>
		);

		// Should mount children.
		expect((renderer.scene.children[0].instance as any).isGroup).toBe(true);
		// Ref should fill with World instance on mount.
		expect(ref!.entities).toBeDefined();
		expect(ref!.isInitialized).toBe(true);
		expect(universe.worlds.length).toBe(1);
	});

	it('should add resources', async () => {
		let ref: Koota.World | null = null;

		const Time = define({ then: 0, delta: 0 });

		await ReactThreeTestRenderer.create(
			<StrictMode>
				<World
					ref={(node) => {
						ref = node;
					}}
					resources={[Time]}
				>
					<group />
				</World>
			</StrictMode>
		);

		// Should have added resources.
		expect(ref!.resources.has(Time)).toBe(true);
	});

	it('should unmount without leaking', async () => {
		expect(universe.worlds.length).toBe(0);

		const renderer = await ReactThreeTestRenderer.create(
			<StrictMode>
				<World>
					<group />
				</World>
			</StrictMode>
		);

		expect(universe.worlds.length).toBe(1);

		await renderer.unmount();

		expect(universe.worlds.length).toBe(0);
	});

	it('handles suspense without leaking', async () => {
		let resolvePromise: () => void;
		let isResolved = false;
		const promise = new Promise<void>((resolve) => {
			resolvePromise = () => {
				isResolved = true;
				resolve();
			};
		});

		function SuspendingComponent() {
			if (!isResolved) throw promise;

			const world = useWorld();

			// Test that the world is immediately available to all uLE.
			useLayoutEffect(() => {
				expect(world.isInitialized).toBe(true);
			}, []);

			return null;
		}

		const renderer = await ReactThreeTestRenderer.create(
			<StrictMode>
				<Suspense fallback={null}>
					<World>
						<SuspendingComponent />
						<group />
					</World>
				</Suspense>
			</StrictMode>
		);

		// Test that the world exists during the suspense
		expect(universe.worlds.length).toBe(0);
		expect(renderer.scene.children.length).toBe(0);

		// Resolve the suspense to continue rendering
		resolvePromise!();

		// Re-render after promise resolves
		await renderer.update(
			<StrictMode>
				<Suspense fallback={null}>
					<World>
						<SuspendingComponent />
						<group />
					</World>
				</Suspense>
			</StrictMode>
		);

		// Test again after the suspense is resolved
		expect(universe.worlds.length).toBe(1);
		expect(renderer.scene.children.length).toBe(1);
	});

	it('can get world using useWorld hook', async () => {
		let ref: Koota.World | null = null;

		function Test() {
			const world = useWorld();
			ref = world;

			return null;
		}

		await ReactThreeTestRenderer.create(
			<StrictMode>
				<World>
					<Test />
				</World>
			</StrictMode>
		);

		expect(ref!.isInitialized).toBe(true);
	});

	it('can take an already defined world as a prop', async () => {
		const world = createWorld();

		let ref: Koota.World | null = null;

		const renderer = await ReactThreeTestRenderer.create(
			<StrictMode>
				<World
					world={world}
					ref={(node) => {
						ref = node;
					}}
				>
					<group />
				</World>
			</StrictMode>
		);

		expect(ref).toBe(world);
		expect(universe.worlds.length).toBe(1);

		await renderer.unmount();

		// The world does not get destroyed since we don't control it.
		expect(universe.worlds.length).toBe(1);
	});
});
