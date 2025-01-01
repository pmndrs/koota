import { CONSTANTS } from '../constants';
import { World } from 'koota';
import { Velocity, Time } from '../trait';

export const updateGravity = ({ world }: { world: World }) => {
	const { delta } = world.get(Time)!;

	world.query(Velocity).updateEach(([velocity]) => {
		// Apply gravity directly to the velocity
		velocity.y += CONSTANTS.GRAVITY * delta;
	});
};
