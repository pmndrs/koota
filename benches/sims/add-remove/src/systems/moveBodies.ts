import { Position } from '../trait/Position';
import { Time } from '../trait/Time';
import { Velocity } from '../trait/Velocity';

export const moveBodies = ({ world }: { world: Koota.World }) => {
	const { delta } = world.resources.get(Time);
	const eids = world.query(Position, Velocity);
	const [position, velocity] = world.get(Position, Velocity);

	for (let i = 0; i < eids.length; i++) {
		const eid = eids[i];

		// Update position based on velocity
		position.x[eid] += velocity.x[eid] * delta;
		position.y[eid] += velocity.y[eid] * delta;
	}
};
