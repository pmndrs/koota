import { createAdded, type World } from 'koota';
import { CONSTANTS } from '../constants';
import { Acceleration, Circle, IsCentralMass, Mass, Position, Velocity } from '../traits';
import { randInRange } from '../utils/randInRange';

export const bodyTraits = [Position, Velocity, Mass, Circle, Acceleration] as const;
const Added = createAdded();

export const setInitial = ({ world }: { world: World }) => {
	const bodies = world.query(Added(...bodyTraits));
	const centralMasses = world.query(Added(...bodyTraits, IsCentralMass));

	bodies.updateEach(([position, velocity, mass, circle]) => {
		if (mass.value === 0) {
			// Random positions
			position.x = randInRange(-4000, 4000);
			position.y = randInRange(-100, 100);
			mass.value = CONSTANTS.BASE_MASS + randInRange(0, CONSTANTS.VAR_MASS);

			// Calculate velocity for a stable orbit, assuming a circular orbit logic
			if (position.x !== 0 || position.y !== 0) {
				const radius = Math.sqrt(position.x ** 2 + position.y ** 2);
				const normX = position.x / radius;
				const normY = position.y / radius;

				// Perpendicular vector for circular orbit
				const vecRotX = -normY;
				const vecRotY = normX;

				const v = Math.sqrt(CONSTANTS.INITIAL_C / radius / mass.value / CONSTANTS.SPEED);
				velocity.x = vecRotX * v;
				velocity.y = vecRotY * v;
			}

			// Set circle radius based on mass
			circle.radius =
				CONSTANTS.MAX_RADIUS * (mass.value / (CONSTANTS.BASE_MASS + CONSTANTS.VAR_MASS)) + 1;
		}
	});

	// Set the central mass properties.
	centralMasses.updateEach(([position, velocity, mass, circle]) => {
		position.x = 0;
		position.y = 0;

		velocity.x = 0;
		velocity.y = 0;

		mass.value = CONSTANTS.CENTRAL_MASS;

		circle.radius = CONSTANTS.MAX_RADIUS / 1.5;
	});
};
