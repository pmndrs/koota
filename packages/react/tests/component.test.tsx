import { define, universe } from '@sweet-ecs/core';
import { beforeEach, describe, expect, it } from 'vitest';
import { useComponent } from '../src/component/use-component';
import { Entity } from '../src/entity/entity';
import { StrictMode } from 'react';
import { World } from '../src/world/world';
import ReactThreeTestRenderer from '@react-three/test-renderer';

declare global {
	var IS_REACT_ACT_ENVIRONMENT: boolean;
}

// Let React know that we'll be testing effectful components
global.IS_REACT_ACT_ENVIRONMENT = true;

const Position = define({ x: 0, y: 0 });
const Name = define({ name: '' });
const IsActive = define();

describe('Component', () => {
	beforeEach(() => {
		universe.reset();
	});

	it('creates component instance with useComponent', async () => {
		function Test() {
			const [position] = useComponent(Position);

			expect(position.x).toBe(0);
			expect(position.y).toBe(0);

			return null;
		}

		await ReactThreeTestRenderer.create(
			<StrictMode>
				<World>
					<Test />
				</World>
			</StrictMode>
		);
	});

	it('creates component instance with useComponent and initial value', async () => {
		function Test() {
			const [name] = useComponent(Name, { name: 'test' });
			const [position] = useComponent(Position, { x: 11, y: 22 });

			expect(name.name).toBe('test');
			expect(position.x).toBe(11);
			expect(position.y).toBe(22);

			return null;
		}

		await ReactThreeTestRenderer.create(
			<StrictMode>
				<World>
					<Test />
				</World>
			</StrictMode>
		);
	});

	it('can set component instance values with a setter and rererender React', async () => {
		let set: any;
		let ref: any;

		function Test() {
			const [position, setPosition] = useComponent(Position);
			set = setPosition;
			ref = position;

			return null;
		}

		await ReactThreeTestRenderer.create(
			<StrictMode>
				<World>
					<Test />
				</World>
			</StrictMode>
		);

		expect(ref.x).toBe(0);
		expect(ref.y).toBe(0);

		set({ x: 12, y: 14 });

		expect(ref.x).toBe(12);
		expect(ref.y).toBe(14);
	});

	it('can add components to Entity', async () => {
		let ref: number | null = null;

		await ReactThreeTestRenderer.create(
			<StrictMode>
				<World>
					<Entity
						ref={(node) => {
							ref = node;
						}}
						components={[Position, Name, IsActive]}
					>
						<group />
					</Entity>
				</World>
			</StrictMode>
		);

		const world = universe.worlds[0];

		expect(world.has(ref!)).toBe(true);
		expect(world.entities.length).toBe(1);

		expect(world.has(ref!, Position)).toBe(true);
		expect(world.has(ref!, Name)).toBe(true);
		expect(world.has(ref!, IsActive)).toBe(true);
	});

	it('can add component instances to Entity', async () => {
		let ref: number | null = null;

		function Test() {
			const [position] = useComponent(Position, { x: 11, y: 22 });
			const [name] = useComponent(Name);

			return (
				<Entity
					ref={(node) => {
						ref = node;
					}}
					components={[position, name]}
				>
					<group />
				</Entity>
			);
		}

		await ReactThreeTestRenderer.create(
			<StrictMode>
				<World>
					<Test />
				</World>
			</StrictMode>
		);

		const world = universe.worlds[0];

		expect(world.has(ref!, Position)).toBe(true);
		expect(world.has(ref!, Name)).toBe(true);

		// Sets the values passed in.
		expect(world.get(Position).x[ref!]).toBe(11);
		expect(world.get(Position).y[ref!]).toBe(22);
	});

	it('triggers a change when a component instance is set and attached to an entity', async () => {
		let ref: number | null = null;
		let set: any;
		let changes: number[] = [];

		function Test() {
			const [position, setPosition] = useComponent(Position);
			set = setPosition;

			return (
				<Entity
					ref={(node) => {
						ref = node;
					}}
					components={[position]}
				>
					<group />
				</Entity>
			);
		}

		await ReactThreeTestRenderer.create(
			<StrictMode>
				<World>
					<Test />
				</World>
			</StrictMode>
		);

		const world = universe.worlds[0];

		// Subscribe to changes.
		world.subscribe(
			(type, entity) => {
				if (type === 'change') changes.push(entity);
			},
			[Position]
		);

		expect(changes.length).toBe(0);

		set({ x: 11, y: 22 });

		expect(changes.length).toBe(1);
	});
});
