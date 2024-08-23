import { Circle } from '../components/Circle';
import { Color } from '../components/Color';
import { Mass } from '../components/Mass';
import { Position } from '../components/Position';
import { Velocity } from '../components/Velocity';
import { CONSTANTS } from '../constants';
import { addBody } from './init';

let draining = true;

export const recycleBodies = ({ world }: { world: Koota.World }) => {
	const eids = world.query(Position, Circle, Mass, Velocity, Color);
	const position = world.get(Position);

	if (eids.length === 0) draining = false;
	if (eids.length > CONSTANTS.BODIES * 0.95) draining = true;

	for (let i = 0; i < eids.length; i++) {
		const eid = eids[i];

		if (position.y[eid] < CONSTANTS.FLOOR) {
			// Remove entity
			world.destroy(eid);

			if (!CONSTANTS.DRAIN) addBody(world);
		}
	}

	if (!CONSTANTS.DRAIN) return;

	const target = Math.min(
		Math.max(CONSTANTS.BODIES * 0.01, eids.length * 0.5),
		CONSTANTS.BODIES - eids.length
	);

	if (!draining) {
		for (let i = 0; i < target; i++) {
			addBody(world);
		}
	}
};
