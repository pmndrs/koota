import ReactThreeTestRenderer from '@react-three/test-renderer';
import { define, universe } from '@koota/core';
import { StrictMode } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { Object3D, Div, World, koota } from '../src';
import { render } from '@testing-library/react';

declare global {
	var IS_REACT_ACT_ENVIRONMENT: boolean;
}

// Let React know that we'll be testing effectful components
global.IS_REACT_ACT_ENVIRONMENT = true;

const Position = define({ x: 0, y: 0 });
const Name = define({ name: '' });
const IsActive = define();

describe('View', () => {
	beforeEach(() => {
		universe.reset();
	});

	it('creates an entity with a Three view using the sweet namespace', async () => {
		let ref: any = null;

		await ReactThreeTestRenderer.create(
			<StrictMode>
				<World>
					<koota.object3D
						ref={(node) => {
							ref = node;
						}}
					/>
				</World>
			</StrictMode>
		);

		const world = universe.worlds[0];
		const entity = world.entities[0];

		expect(ref).not.toBeNull();
		expect(ref.isObject3D).toBe(true);
		expect(world.entities.length).toBe(1);
		expect(world.has(entity, Object3D)).toBe(true);
		expect(world.get(Object3D).object[entity]).toBe(ref);
	});

	it('can add components to view entities', async () => {
		let ref: any = null;

		await ReactThreeTestRenderer.create(
			<StrictMode>
				<World>
					<koota.object3D
						ref={(node) => {
							ref = node;
						}}
						components={[Position, Name, IsActive]}
					/>
				</World>
			</StrictMode>
		);

		const world = universe.worlds[0];
		const entity = world.entities[0];

		expect(ref).not.toBeNull();
		expect(ref.isObject3D).toBe(true);
		expect(world.entities.length).toBe(1);
		expect(world.has(entity, Object3D)).toBe(true);
		expect(world.has(entity, Position)).toBe(true);
		expect(world.has(entity, Name)).toBe(true);
		expect(world.has(entity, IsActive)).toBe(true);
	});

	it('can add components to DOM view entities using the sweet namespace', async () => {
		let ref: any = null;

		await render(
			<World>
				<koota.div
					ref={(node) => {
						ref = node;
					}}
					components={[Position, Name, IsActive]}
				/>
			</World>
		);

		const world = universe.worlds[0];
		const entity = world.entities[0];

		expect(ref).not.toBeNull();
		expect(ref.tagName).toBe('DIV');
		expect(world.entities.length).toBe(1);
		expect(world.has(entity, Div)).toBe(true);
		expect(world.has(entity, Position)).toBe(true);
		expect(world.has(entity, Name)).toBe(true);
		expect(world.has(entity, IsActive)).toBe(true);
	});
});
