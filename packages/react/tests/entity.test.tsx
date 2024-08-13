import ReactThreeTestRenderer from '@react-three/test-renderer';
import { universe } from '@sweet-ecs/core';
import { StrictMode, Suspense } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { Entity } from '../src/entity/entity';
import { World } from '../src/world/world';

declare global {
	var IS_REACT_ACT_ENVIRONMENT: boolean;
}

// Let React know that we'll be testing effectful components
global.IS_REACT_ACT_ENVIRONMENT = true;

describe('Entity', () => {
	beforeEach(() => {
		universe.reset();
	});

	it('creates Entity on mount', async () => {
		let ref: number | null = null;

		const renderer = await ReactThreeTestRenderer.create(
			<StrictMode>
				<World>
					<Entity
						ref={(node) => {
							ref = node;
							// Ref should be ready immediately
							expect(node).not.toBe(null);
						}}
					>
						<group />
					</Entity>
				</World>
			</StrictMode>
		);

		const world = universe.worlds[0];

		// Should mount children.
		expect((renderer.scene.children[0].instance as any).isGroup).toBe(true);
		// Ref should fill with Entity instance on mount.
		expect(typeof ref).toBe('number');
		// World should have the entity with no leaks.
		expect(world.has(ref!)).toBe(true);
		expect(world.entities.length).toBe(1);
	});

	it('should unmount Entity', async () => {
		const renderer = await ReactThreeTestRenderer.create(
			<StrictMode>
				<World>
					<Entity>
						<group />
					</Entity>
				</World>
			</StrictMode>
		);

		const world = universe.worlds[0];

		expect(world.entities.length).toBe(1);

		await renderer.update(
			<StrictMode>
				<World></World>
			</StrictMode>
		);

		expect(renderer.scene.children.length).toBe(0);
		expect(world.entities.length).toBe(0);

		// Add a bunch of entities after initializatoin.
		await renderer.update(
			<StrictMode>
				<World>
					<Entity />
					<Entity />
					<Entity />
					<Entity />
					<Entity />
					<Entity />
				</World>
			</StrictMode>
		);

		expect(world.entities.length).toBe(6);

		// Unmount them all.
		await renderer.update(
			<StrictMode>
				<World />
			</StrictMode>
		);

		expect(world.entities.length).toBe(0);
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
			return null;
		}

		const renderer = await ReactThreeTestRenderer.create(
			<StrictMode>
				<World>
					<Suspense fallback={null}>
						<SuspendingComponent />
						<Entity />
						<Entity />
						<Entity />
					</Suspense>
				</World>
			</StrictMode>
		);

		const world = universe.worlds[0];

		expect(world.entities.length).toBe(0);

		resolvePromise!();
		await renderer.update(
			<StrictMode>
				<World>
					<Suspense fallback={null}>
						<SuspendingComponent />
						<Entity />
						<Entity />
						<Entity />
					</Suspense>
				</World>
			</StrictMode>
		);

		expect(world.entities.length).toBe(3);
	});

	it('can nest Entities', async () => {
		let ref: number | null = null;

		const renderer = await ReactThreeTestRenderer.create(
			<StrictMode>
				<World>
					<Entity
						ref={(node) => {
							ref = node;
						}}
					>
						<Entity>
							<group />
						</Entity>
					</Entity>
				</World>
			</StrictMode>
		);

		const world = universe.worlds[0];

		// Should mount children.
		expect((renderer.scene.children[0].instance as any).isGroup).toBe(true);
		// Ref should fill with Entity instance on mount.
		expect(typeof ref).toBe('number');
		// World should have the entity with no leaks.
		expect(world.has(ref!)).toBe(true);
		expect(world.entities.length).toBe(2);

		await renderer.update(
			<StrictMode>
				<World>
					<Entity></Entity>
				</World>
			</StrictMode>
		);

		expect(world.entities.length).toBe(1);
	});
});
