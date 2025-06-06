import { createAdded, type World } from 'koota';
import { CONSTANTS } from '../constants';
import { Circle, Color, DummyComponents, Mass, Position, Velocity } from '../trait';
import { randInRange } from '../utils/randInRange';

const body = [Position, Velocity, Mass, Circle, Color] as const;
const Added = createAdded();

export const setInitial = ({ world }: { world: World }) => {
	world.query(Added(...body)).updateEach(([position, velocity, mass, circle, color], entity) => {
		// Random positions
		position.x = randInRange(-400, 400);
		position.y = 100;
		// Jitter the z position to avoid z-fighting
		position.z = randInRange(-50, 50);

		// Shoot the bodies up at random angles and velocities
		const angle = randInRange(0, Math.PI * 2);
		const speed = randInRange(0, 50);
		velocity.x = Math.cos(angle) * speed;
		velocity.y = Math.sin(angle) * speed;

		// Add a random number of components to the body
		const numComponents = Math.floor(Math.random() * CONSTANTS.MAX_COMPS_PER_ENTITY);
		for (let j = 0; j < numComponents; j++) {
			entity.add(DummyComponents[Math.floor(Math.random() * DummyComponents.length)]);
		}

		// Set mass and radius based on the number of components
		mass.value = 1 + numComponents;
		circle.radius = mass.value;

		// Random colors
		color.r = randInRange(0, 255);
		color.g = randInRange(0, 255);
		color.b = randInRange(0, 255);
	});
};
