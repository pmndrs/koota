import { Acceleration, Circle, IsCentralMass, Mass, Position, Velocity } from '../components';
import { CONSTANTS } from '../constants';
import { randInRange } from '../utils/randInRange';
import { createAdded } from 'koota';

export const body = [Position, Velocity, Mass, Circle, Acceleration] as const;
const Added = createAdded();

export const setInitial = ({ world }: { world: Koota.World }) => {
	const ents = world.query(Added(...body));
	const centralMassEnts = world.query(Added(...body, IsCentralMass));
	const [position, velocity, mass, circle] = world.get(...body);

	for (let i = 0; i < ents.length; i++) {
		const e = ents[i];

		// Random positions
		position.x[e] = randInRange(-4000, 4000);
		position.y[e] = randInRange(-100, 100);
		mass.value[e] = CONSTANTS.BASE_MASS + randInRange(0, CONSTANTS.VAR_MASS);

		// Calculate velocity for a stable orbit, assuming a circular orbit logic
		if (position.x[e] !== 0 || position.y[e] !== 0) {
			const radius = Math.sqrt(position.x[e] ** 2 + position.y[e] ** 2);
			const normX = position.x[e] / radius;
			const normY = position.y[e] / radius;

			// Perpendicular vector for circular orbit
			const vecRotX = -normY;
			const vecRotY = normX;

			const v = Math.sqrt(CONSTANTS.INITIAL_C / radius / mass.value[e] / CONSTANTS.SPEED);
			velocity.x[e] = vecRotX * v;
			velocity.y[e] = vecRotY * v;
		}

		// Set circle radius based on mass
		circle.radius[e] =
			CONSTANTS.MAX_RADIUS * (mass.value[e] / (CONSTANTS.BASE_MASS + CONSTANTS.VAR_MASS)) + 1;
	}

	// Set the central mass properties.
	for (let i = 0; i < centralMassEnts.length; i++) {
		const e = centralMassEnts[i];

		position.x[e] = 0;
		position.y[e] = 0;

		velocity.x[e] = 0;
		velocity.y[e] = 0;

		mass.value[e] = CONSTANTS.CENTRAL_MASS;

		circle.radius[e] = CONSTANTS.MAX_RADIUS / 1.5;
	}
};
