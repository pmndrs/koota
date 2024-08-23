import { Circle } from '../components/Circle';
import { Color } from '../components/Color';
import { Mass } from '../components/Mass';
import { Position } from '../components/Position';
import { Velocity } from '../components/Velocity';
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
