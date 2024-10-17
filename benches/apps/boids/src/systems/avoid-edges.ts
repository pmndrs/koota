import { World } from 'koota';
import { Forces, Position } from '../traits';

const factor = 5;
const maxDistance = 10;

export const avoidEdges = ({ world }: { world: World }) => {
	world.query(Forces, Position).updateEach(([{ avoidEdges }, { value: position }]) => {
		const distance = position.length();

		if (distance > maxDistance) {
			avoidEdges.copy(position).normalize().negate().multiplyScalar(factor);
		}
	});
};
