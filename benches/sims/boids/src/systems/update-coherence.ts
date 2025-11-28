import type { World } from 'koota';
import { Forces, NeighborOf, Position } from '../traits';
import { CONFIG } from '../config';

export const updateCoherence = ({ world }: { world: World }) => {
	const { coherenceFactor } = CONFIG;

	world.query(Forces, Position).updateEach(([{ coherence }, position], entity) => {
		const neighbors = entity.targetsFor(NeighborOf);

		coherence.x = 0;
		coherence.y = 0;
		coherence.z = 0;

		if (neighbors.length === 0) return;

		for (const neighbor of neighbors) {
			const neighborPosition = neighbor.get(Position)!;
			coherence.x += neighborPosition.x;
			coherence.y += neighborPosition.y;
			coherence.z += neighborPosition.z;
		}

		coherence.x /= neighbors.length;
		coherence.y /= neighbors.length;
		coherence.z /= neighbors.length;

		coherence.x -= position.x;
		coherence.y -= position.y;
		coherence.z -= position.z;

		coherence.x *= coherenceFactor;
		coherence.y *= coherenceFactor;
		coherence.z *= coherenceFactor;
	});
};
