import type { World } from 'koota';
import { Forces, Position } from '../traits';
import { CONFIG } from '../config';

const { avoidEdgesFactor, avoidEdgesMaxDistance } = CONFIG;

export const avoidEdges = ({ world }: { world: World }) => {
	world.query(Forces, Position).updateEach(([{ avoidEdges }, position]) => {
		// Calculate the distance from the origin
		const distance = Math.sqrt(position.x ** 2 + position.y ** 2 + position.z ** 2);

		// If the distance is greater than the max distance, apply a force pushing the boid back towards the origin
		if (distance > avoidEdgesMaxDistance) {
			const normalized = {
				x: position.x / distance,
				y: position.y / distance,
				z: position.z / distance,
			};

			avoidEdges.x = -normalized.x * avoidEdgesFactor;
			avoidEdges.y = -normalized.y * avoidEdgesFactor;
			avoidEdges.z = -normalized.z * avoidEdgesFactor;
		}
	});
};
