import { createWorld, type Entity, trait, type TraitInstance, universe, type World } from '../../dist';
import { render } from '@testing-library/react';
import { act, StrictMode, useEffect, useState } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useTrait, useTraitEffect, WorldProvider } from '../../react';

declare global {
	var IS_REACT_ACT_ENVIRONMENT: boolean;
}

// Let React know that we'll be testing effectful components
global.IS_REACT_ACT_ENVIRONMENT = true;

let world: World;
const Position = trait({ x: 0, y: 0 });

describe('useTrait', () => {
	beforeEach(() => {
		universe.reset();
		world = createWorld();
	});

	it('reactively returns the trait value for an entity', async () => {
		const entity = world.spawn(Position);
		let position: TraitInstance<typeof Position> | undefined ;

		function Test() {
			position = useTrait(entity, Position);
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

		expect(position).toEqual({ x: 0, y: 0 });

		await act(async () => {
			entity.set(Position, { x: 1, y: 1 });
		});

		expect(position).toEqual({ x: 1, y: 1 });
	});

	it('reactively works with an entity at effect time', async () => {
		let entity: Entity | undefined ;
		let position: TraitInstance<typeof Position> | undefined ;

		function Test() {
			const [, set] = useState(0);

			// Rerender to ensure the entity is not stale for useTrait
			useEffect(() => {
				entity = world.spawn(Position);
				set((v) => v + 1);
			}, []);

			position = useTrait(entity, Position);
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

		expect(position).toEqual({ x: 0, y: 0 });

		await act(async () => {
			entity!.set(Position, { x: 1, y: 1 });
		});

		expect(position).toEqual({ x: 1, y: 1 });
	});

	it('works with a world', async () => {
		const TimeOfDay = trait({ hour: 0 });
		world.add(TimeOfDay);
		let timeOfDay: TraitInstance<typeof TimeOfDay> | undefined ;

		function Test() {
			timeOfDay = useTrait(world, TimeOfDay);
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

		expect(timeOfDay).toEqual({ hour: 0 });

		await act(async () => {
			world.set(TimeOfDay, { hour: 1 });
		});

		expect(timeOfDay).toEqual({ hour: 1 });
	});

	it('returns undefined when the target is undefined', async () => {
		let position: TraitInstance<typeof Position> | undefined ;
		let entity: Entity | undefined ;

		function Test() {
			position = useTrait(entity, Position);
			return null;
		}

		const { rerender } = render(
			<StrictMode>
				<WorldProvider world={world}>
					<Test />
				</WorldProvider>
			</StrictMode>
		);

		expect(position).toBeUndefined();

		await act(async () => {
			entity = world.spawn(Position);
			rerender(
				<StrictMode>
					<WorldProvider world={world}>
						<Test />
					</WorldProvider>
				</StrictMode>
			);
		});

		expect(position).toEqual({ x: 0, y: 0 });
	});

	it('reactively updates when the world is reset', async () => {
		const entity = world.spawn(Position);
		let position: TraitInstance<typeof Position> | undefined ;

		function Test() {
			position = useTrait(entity, Position);
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

			entity.set(Position, { x: 1, y: 1 });
		});

		expect(position).toEqual({ x: 1, y: 1 });

		await act(async () => {
			world.reset();
		});

		expect(position).toBeUndefined();
	});
});

describe('useTraitEffect', () => {
	beforeEach(() => {
		universe.reset();
		world = createWorld();
	});

	it('reactively calls callback when trait value changes', async () => {
		const entity = world.spawn(Position);
		let position: TraitInstance<typeof Position> | undefined ;

		function Test() {
			useTraitEffect(entity, Position, (value: TraitInstance<typeof Position> | undefined) => {
				position = value;
			});
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

		expect(position).toEqual({ x: 0, y: 0 });

		await act(async () => {
			entity.set(Position, { x: 1, y: 1 });
		});

		expect(position).toEqual({ x: 1, y: 1 });
	});

	it('calls callback with undefined when trait is removed', async () => {
		const entity = world.spawn(Position);
		let position: TraitInstance<typeof Position> | undefined ;

		function Test() {
			useTraitEffect(entity, Position, (value: TraitInstance<typeof Position> | undefined) => {
				position = value;
			});
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

		expect(position).toEqual({ x: 0, y: 0 });

		await act(async () => {
			entity.remove(Position);
		});

		expect(position).toBeUndefined();
	});

	it('works with a world trait', async () => {
		const TimeOfDay = trait({ hour: 0 });
		world.add(TimeOfDay);
		let timeOfDay: TraitInstance<typeof TimeOfDay> | undefined ;

		function Test() {
			useTraitEffect(world, TimeOfDay, (value: TraitInstance<typeof TimeOfDay> | undefined) => {
				timeOfDay = value;
			});
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

		expect(timeOfDay).toEqual({ hour: 0 });

		await act(async () => {
			world.set(TimeOfDay, { hour: 1 });
		});

		expect(timeOfDay).toEqual({ hour: 1 });
	});
});
