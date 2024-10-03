import { getIndex } from 'koota';
import { Time } from '../components/Time';
import { CONSTANTS } from '../constants';
import { body } from './setInitial';

export const updateGravity = ({ world }: { world: Koota.World }) => {
	const ents = world.query(...body);
	const { delta } = world.get(Time)!;
	const [position, velocity, mass, _, acceleration] = world.getStore(...body);

	for (let j = 0; j < ents.length; j++) {
		const eSelf = getIndex(ents[j]);

		acceleration.x[eSelf] = 0;
		acceleration.y[eSelf] = 0;

		for (let i = 0; i < ents.length; i++) {
			const eTarget = getIndex(ents[i]);
			if (eSelf === eTarget) continue; // Skip self

			const dx = +position.x[eTarget] - +position.x[eSelf];
			const dy = +position.y[eTarget] - +position.y[eSelf];
			let distanceSquared = dx * dx + dy * dy;

			if (distanceSquared < CONSTANTS.STICKY) distanceSquared = CONSTANTS.STICKY; // Apply stickiness

			const distance = Math.sqrt(distanceSquared);
			const forceMagnitude = (+mass.value[eSelf] * +mass.value[eTarget]) / distanceSquared;

			acceleration.x[eSelf] += (dx / distance) * forceMagnitude;
			acceleration.y[eSelf] += (dy / distance) * forceMagnitude;
		}

		// Apply computed force to entity's velocity, adjusting for its mass
		velocity.x[eSelf] += (acceleration.x[eSelf] * delta) / mass.value[eSelf];
		velocity.y[eSelf] += (acceleration.y[eSelf] * delta) / mass.value[eSelf];
	}
};
