import { Circle } from '../trait/Circle';
import { Color } from '../trait/Color';
import { Mass } from '../trait/Mass';
import { Position } from '../trait/Position';
import { Velocity } from '../trait/Velocity';
import { CONSTANTS } from '../constants';

let first = false;

export const init = ({ world }: { world: Koota.World }) => {
	if (first) return;

	for (let i = 0; i < CONSTANTS.BODIES; i++) {
		addBody(world);
	}

	first = true;
};

export const addBody = (world: Koota.World) => {
	world.create(Position, Velocity, Mass, Circle, Color);
};
