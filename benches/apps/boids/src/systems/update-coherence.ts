import { World } from 'koota';
import { Forces, Neighbors, Position } from '../traits';

const factor = 3;

export const updateCoherence = ({ world }: { world: World }) => {
	world
		.query(Forces, Neighbors, Position)
		.updateEach(([forces, { value: neighbors }, { value: position }]) => {
			const { coherence } = forces;

			coherence.set(0, 0, 0);

			if (neighbors.length === 0) return;

			for (const neighbor of neighbors) {
				coherence.add(neighbor.get(Position).value);
			}

			coherence.divideScalar(neighbors.length);
			coherence.sub(position).multiplyScalar(factor);
		});
};
