import ReactThreeTestRenderer from '@react-three/test-renderer';
import { define, universe } from '@koota/core';
import { StrictMode } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { Entity } from '../src/entity/entity';
import { useQuery } from '../src/query/use-query';
import { World } from '../src/world/world';

declare global {
	var IS_REACT_ACT_ENVIRONMENT: boolean;
}

// Let React know that we'll be testing effectful components
global.IS_REACT_ACT_ENVIRONMENT = true;

const Position = define({ x: 0, y: 0 });

describe('Query', () => {
	beforeEach(() => {
		universe.reset();
	});

	it('reactively returns query results with useQuery', async () => {
		let entities: number[] = [];

		function Test() {
			entities = useQuery(Position);
			return null;
		}

		function PositionEntity() {
			return <Entity components={[Position]} />;
		}

		const renderer = await ReactThreeTestRenderer.create(
			<StrictMode>
				<World>
					<Test />
				</World>
			</StrictMode>
		);

		expect(entities.length).toBe(0);

		await renderer.update(
			<StrictMode>
				<World>
					<Test />
					<PositionEntity />
					<PositionEntity />
					<PositionEntity />
				</World>
			</StrictMode>
		);

		expect(entities.length).toBe(3);
	});
});
