import { CONSTANTS } from '../constants';
import { Position } from '../components/Position';
import { Velocity } from '../components/Velocity';
import { Mass } from '../components/Mass';
import { Circle } from '../components/Circle';
import { randInRange } from '../utils/randInRange';
import { Color } from '../components/Color';
import { DummyComponents } from '../components/Dummy';
import { createAdded } from 'koota';

const body = [Position, Velocity, Mass, Circle] as const;
const Added = createAdded();

export const setInitial = ({ world }: { world: Koota.World }) => {
	const eids = world.query(Added(...body));
	const [position, velocity, circle, mass, color] = world.get(Position, Velocity, Circle, Mass, Color); // prettier-ignore

	for (let i = 0; i < eids.length; i++) {
		const eid = eids[i];

		// Random positions
		position.x[eid] = randInRange(-400, 400);
		position.y[eid] = 100;
		// Jitter the z position to avoid z-fighting
		position.z[eid] = randInRange(-50, 50);

		// Shoot the bodies up at random angles and velocities
		const angle = randInRange(0, Math.PI * 2);
		const speed = randInRange(0, 50);
		velocity.x[eid] = Math.cos(angle) * speed;
		velocity.y[eid] = Math.sin(angle) * speed;

		// Add a random number of components to the body
		const numComponents = Math.floor(Math.random() * CONSTANTS.MAX_COMPS_PER_ENTITY);
		for (let j = 0; j < numComponents; j++) {
			world.add(eid, DummyComponents[Math.floor(Math.random() * DummyComponents.length)]);
		}

		// Set mass and radius based on the number of components
		mass.value[eid] = 1 + numComponents;
		circle.radius[eid] = mass.value[eid];

		// Random colors
		color.r[eid] = randInRange(0, 255);
		color.g[eid] = randInRange(0, 255);
		color.b[eid] = randInRange(0, 255);
	}
};
