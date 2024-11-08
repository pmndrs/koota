import { World } from 'koota';
import { Input, Movement } from '../traits';

export const dampPlayerMovement = ({ world }: { world: World }) => {
	world.query(Movement, Input).updateEach(([{ velocity, damping }, input]) => {
		if (input.direction.lengthSq() === 0) {
			velocity.multiplyScalar(damping);
		}
	});
};
