import { getIndex } from 'koota';
import { Circle, Repulse, Mass, Position, Time, Velocity } from '../components';

const repulsor = [Repulse, Position, Circle];
const body = [Position, Velocity, Mass];

export const handleRepulse = ({ world }: { world: Koota.World }) => {
	const repuslors = world.query(...repulsor);
	if (repuslors.length === 0) return;

	const bodyIds = world.query(...body);
	const [position, velocity, mass, repulse, circle] = world.getStore(Position, Velocity, Mass, Repulse, Circle); // prettier-ignore
	const { delta } = world.get(Time);

	for (let i = repuslors.length - 1; i >= 0; i--) {
		const rid = getIndex(repuslors[i]);

		// Count down the delay
		if (repulse.delay[rid] > 0) repulse.delay[rid] -= delta;

		// Decay the circle radius by the explosion decay
		if (repulse.delay[rid] <= 0) {
			circle.radius[rid] -= circle.radius[rid] * repulse.decay[rid] * delta;
			repulse.force[rid] -= repulse.force[rid] * repulse.decay[rid] * delta;
		}

		if (circle.radius[rid] <= 5) {
			repuslors[i].destroy();
			continue;
		}

		for (let j = bodyIds.length - 1; j >= 0; j--) {
			const bid = bodyIds[j];
			if (rid === bid) continue;

			const dx = position.x[bid] - position.x[rid];
			const dy = position.y[bid] - position.y[rid];
			const distanceSquared = dx * dx + dy * dy;

			if (distanceSquared < circle.radius[rid] * circle.radius[rid]) {
				const distance = Math.sqrt(distanceSquared);
				const forceMagnitude = (repulse.force[rid] * (circle.radius[rid] - distance)) / circle.radius[rid]; // prettier-ignore
				const forceX = (dx / distance) * forceMagnitude;
				const forceY = (dy / distance) * forceMagnitude;

				velocity.x[bid] += (forceX * delta) / mass.value[bid];
				velocity.y[bid] += (forceY * delta) / mass.value[bid];
			}
		}
	}
};
