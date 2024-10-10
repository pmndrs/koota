import { Time } from '../components/Time';
import { CONSTANTS } from '../constants';
import { bodyTraits } from './setInitial';

export const updateGravity = ({ world }: { world: Koota.World }) => {
	const bodies = world.query(...bodyTraits);
	const { delta } = world.get(Time)!;

	bodies.useStores(([position, velocity, mass, _, acceleration], bodies) => {
		for (let j = 0; j < bodies.length; j++) {
			const currentId = bodies[j].id();

			acceleration.x[currentId] = 0;
			acceleration.y[currentId] = 0;

			for (let i = 0; i < bodies.length; i++) {
				const targetId = bodies[i].id();
				if (currentId === targetId) continue; // Skip self

				const dx = +position.x[targetId] - +position.x[currentId];
				const dy = +position.y[targetId] - +position.y[currentId];
				let distanceSquared = dx * dx + dy * dy;

				if (distanceSquared < CONSTANTS.STICKY) distanceSquared = CONSTANTS.STICKY; // Apply stickiness

				const distance = Math.sqrt(distanceSquared);
				const forceMagnitude =
					(+mass.value[currentId] * +mass.value[targetId]) / distanceSquared;

				acceleration.x[currentId] += (dx / distance) * forceMagnitude;
				acceleration.y[currentId] += (dy / distance) * forceMagnitude;
			}

			// Apply computed force to entity's velocity, adjusting for its mass
			velocity.x[currentId] += (acceleration.x[currentId] * delta) / mass.value[currentId];
			velocity.y[currentId] += (acceleration.y[currentId] * delta) / mass.value[currentId];
		}
	});
};
