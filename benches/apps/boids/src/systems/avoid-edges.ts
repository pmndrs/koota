import type { World } from 'koota';
import { BoidsConfig, Forces, Position } from '../traits';

export const avoidEdges = ({ world }: { world: World }) => {
	const { avoidEdgesFactor, avoidEdgesMaxDistance } = world.get(BoidsConfig)!;

	world.query(Forces, Position).updateEach(([{ avoidEdges }, position]) => {
		const distance = position.length();

		if (distance > avoidEdgesMaxDistance) {
			avoidEdges.copy(position).normalize().negate().multiplyScalar(avoidEdgesFactor);
		}
	});
};
