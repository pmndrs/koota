import { World } from 'koota';
import { BoidsConfig, Forces, Neighbors, Position } from '../traits';

export const updateSeparation = ({ world }: { world: World }) => {
	const { separationFactor } = world.get(BoidsConfig);

	world.query(Forces, Neighbors, Position).updateEach(([{ separation }, neighbors, position]) => {
		separation.set(0, 0, 0);

		if (neighbors.length === 0) return;

		for (const neighbor of neighbors) {
			const neighborPosition = neighbor.get(Position);
			const distance = position.distanceTo(neighborPosition);
			// Add a small epsilon to avoid division by zero
			const safeDistance = Math.max(distance, 0.001);
			const direction = position.clone().sub(neighborPosition).normalize();
			// Inverse square law for separation
			separation.add(direction.divideScalar(safeDistance * safeDistance));
		}

		separation.divideScalar(neighbors.length).multiplyScalar(separationFactor);
	});
};
