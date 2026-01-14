import type { World } from 'koota';
import { Forces, Position } from '../traits';
import { CONFIG } from '../config';

export const avoidEdges = ({ world }: { world: World }) => {
    const { avoidEdgesFactor, avoidEdgesMaxDistance } = CONFIG;

    world.query(Forces, Position).updateEach(([{ avoidEdges }, position]) => {
        const distance = Math.sqrt(position.x ** 2 + position.y ** 2 + position.z ** 2);

        if (distance > avoidEdgesMaxDistance) {
            // Scale force by how far past the boundary (stronger the further out)
            const overshoot = distance - avoidEdgesMaxDistance;
            const strength = avoidEdgesFactor * (1 + overshoot * 0.5);

            avoidEdges.x = (-position.x / distance) * strength;
            avoidEdges.y = (-position.y / distance) * strength;
            avoidEdges.z = (-position.z / distance) * strength;
        } else {
            avoidEdges.x = 0;
            avoidEdges.y = 0;
            avoidEdges.z = 0;
        }
    });
};
