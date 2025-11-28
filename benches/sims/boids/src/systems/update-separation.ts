import type { World } from 'koota';
import { Forces, NeighborOf, Position } from '../traits';
import { CONFIG } from '../config';

export const updateSeparation = ({ world }: { world: World }) => {
	const { separationFactor } = CONFIG;

	world.query(Forces, Position).updateEach(([{ separation }, position], entity) => {
		const neighbors = entity.targetsFor(NeighborOf);

		separation.x = 0;
		separation.y = 0;
		separation.z = 0;

		if (neighbors.length === 0) return;

		for (const neighbor of neighbors) {
			const neighborPosition = neighbor.get(Position)!;
			const dx = position.x - neighborPosition.x;
			const dy = position.y - neighborPosition.y;
			const dz = position.z - neighborPosition.z;
			const distanceSq = dx * dx + dy * dy + dz * dz;

			// Inverse linear law for separation (softer but longer range than inverse square)
			separation.x += dx / distanceSq;
			separation.y += dy / distanceSq;
			separation.z += dz / distanceSq;
		}

		separation.x = (separation.x / neighbors.length) * separationFactor;
		separation.y = (separation.y / neighbors.length) * separationFactor;
		separation.z = (separation.z / neighbors.length) * separationFactor;
	});
};
