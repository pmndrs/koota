import { World } from 'koota';
import { BoidsConfig, Forces, Neighbors, Velocity } from '../traits';

export const updateAlignment = ({ world }: { world: World }) => {
	const { alignmentFactor } = world.get(BoidsConfig);

	world.query(Forces, Neighbors).updateEach(([{ alignment }, { value: neighbors }]) => {
		alignment.set(0, 0, 0);

		if (neighbors.length === 0) return;

		for (const neighbor of neighbors) {
			alignment.add(neighbor.get(Velocity).value);
		}

		alignment.divideScalar(neighbors.length).multiplyScalar(alignmentFactor);
	});
};
