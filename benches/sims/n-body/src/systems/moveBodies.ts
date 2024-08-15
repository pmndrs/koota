import { CONSTANTS } from '../constants';
import { Velocity } from '../components/Velocity';
import { Position } from '../components/Position';
import { Time } from '../components/Time';

export const moveBodies = ({ world }: { world: Sweet.World }) => {
	const ents = world.query(Position, Velocity);
	const { delta } = world.resources.get(Time);
	const [position, velocity] = world.get(Position, Velocity);

	for (let i = 0; i < ents.length; i++) {
		const e = ents[i];

		// Update position based on velocity and the global SPEED factor
		position.x[e] += CONSTANTS.SPEED * velocity.x[e] * delta;
		position.y[e] += CONSTANTS.SPEED * velocity.y[e] * delta;
	}
};
