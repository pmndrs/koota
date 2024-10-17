import { World } from 'koota';
import { Forces, Neighbors, Position } from '../traits';

const factor = 16;

export const updateSeparation = ({ world }: { world: World }) => {
	world
		.query(Forces, Neighbors, Position)
		.updateEach(([{ separation }, { value: neighbors }, { value: position }]) => {
			separation.set(0, 0, 0);

			if (neighbors.length === 0) return;

			for (const neighbor of neighbors) {
				const neighborPosition = neighbor.get(Position).value;
				const distance = position.distanceTo(neighborPosition);
				// Add a small epsilon to avoid division by zero
				const safeDistance = Math.max(distance, 0.001);
				const direction = position.clone().sub(neighborPosition).normalize();
				// Inverse square law for separation
				separation.add(direction.divideScalar(safeDistance * safeDistance));
			}

			separation.divideScalar(neighbors.length).multiplyScalar(factor);
		});
};
