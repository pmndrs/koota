import type { World } from 'koota';
import { Forces, NeighborOf, Velocity } from '../traits';
import { CONFIG } from '../config';

export const updateAlignment = ({ world }: { world: World }) => {
	const { alignmentFactor } = CONFIG;

	world.query(Forces, Velocity).updateEach(([{ alignment }, velocity], entity) => {
		const neighbors = entity.targetsFor(NeighborOf);

		alignment.x = 0;
		alignment.y = 0;
		alignment.z = 0;

		if (neighbors.length === 0) return;

		for (const neighbor of neighbors) {
			const neighborVelocity = neighbor.get(Velocity)!;
			alignment.x += neighborVelocity.x;
			alignment.y += neighborVelocity.y;
			alignment.z += neighborVelocity.z;
		}

		// Average neighbor velocity minus own velocity = steering force
		alignment.x = (alignment.x / neighbors.length - velocity.x) * alignmentFactor;
		alignment.y = (alignment.y / neighbors.length - velocity.y) * alignmentFactor;
		alignment.z = (alignment.z / neighbors.length - velocity.z) * alignmentFactor;
	});
};

