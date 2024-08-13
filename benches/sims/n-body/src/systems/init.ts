import { World } from '@sweet-ecs/core';
import { Acceleration, Circle, Color, IsCentralMass, Mass, Position, Velocity } from '../components';
import { CONSTANTS } from '../constants';

let inited = false;

export const init = ({ world }: { world: World }) => {
	if (inited) return;

	for (let i = 0; i < CONSTANTS.NBODIES; i++) {
		const entity = world.create(Position, Velocity, Mass, Circle, Color, Acceleration);

		// Make the first entity the central mass.
		if (i === 0) world.add(entity, IsCentralMass);
	}

	inited = true;
};
