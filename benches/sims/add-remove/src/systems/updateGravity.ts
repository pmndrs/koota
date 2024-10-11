import { Velocity } from '../trait/Velocity';
import { Mass } from '../trait/Mass';
import { Position } from '../trait/Position';
import { CONSTANTS } from '../constants';
import { Time } from '../trait/Time';

export const updateGravity = ({ world }: { world: Koota.World }) => {
	const eids = world.query(Position, Mass, Velocity);
	const { delta } = world.resources.get(Time);
	const velocity = world.get(Velocity);

	for (let i = 0; i < eids.length; i++) {
		const eid = eids[i];

		// Apply gravity directly to the velocity
		velocity.y[eid] += CONSTANTS.GRAVITY * delta;
	}
};
