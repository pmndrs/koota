import type { World } from 'koota';
import { Circle, Mass, Position, Repulse, Time, Velocity } from '../traits';

export const handleRepulse = ({ world }: { world: World }) => {
	const repulsors = world.query(Repulse, Position, Circle);
	if (repulsors.length === 0) return;

	const bodies = world.query(Position, Velocity, Mass);
	const { delta } = world.get(Time)!;

	repulsors.updateEach(([repulse, position, circle], entity) => {
		// Count down the delay
		if (repulse.delay > 0) repulse.delay -= delta;

		// Decay the circle radius by the explosion decay
		if (repulse.delay <= 0) {
			circle.radius -= circle.radius * repulse.decay * delta;
			repulse.force -= repulse.force * repulse.decay * delta;
		}

		if (circle.radius <= 5) {
			entity.destroy();
			return;
		}

		bodies.updateEach(([bodyPostion, bodyVelocity, bodyMass], bodyEntity) => {
			if (entity === bodyEntity) return;

			const dx = bodyPostion.x - position.x;
			const dy = bodyPostion.y - position.y;
			const distanceSquared = dx * dx + dy * dy;

			if (distanceSquared < circle.radius * circle.radius) {
				const distance = Math.sqrt(distanceSquared);
				const forceMagnitude = (repulse.force * (circle.radius - distance)) / circle.radius; // prettier-ignore
				const forceX = (dx / distance) * forceMagnitude;
				const forceY = (dy / distance) * forceMagnitude;

				bodyVelocity.x += (forceX * delta) / bodyMass.value;
				bodyVelocity.y += (forceY * delta) / bodyMass.value;
			}
		});
	});
};

// export const handleRepulse = ({ world }: { world: Koota.World }) => {
// 	const repulsors = world.queryResults(...repulsor);
// 	if (repulsors.length === 0) return;

// 	const bodies = world.queryResults(...body);
// 	const [position, velocity, mass, repulse, circle] = world.getStore(Position, Velocity, Mass, Repulse, Circle); // prettier-ignore
// 	const { delta } = world.get(Time);

// 	for (let i = repulsors.length - 1; i >= 0; i--) {
// 		const rid = getIndex(repulsors[i]);

// 		// Count down the delay
// 		if (repulse.delay[rid] > 0) repulse.delay[rid] -= delta;

// 		// Decay the circle radius by the explosion decay
// 		if (repulse.delay[rid] <= 0) {
// 			circle.radius[rid] -= circle.radius[rid] * repulse.decay[rid] * delta;
// 			repulse.force[rid] -= repulse.force[rid] * repulse.decay[rid] * delta;
// 		}

// 		if (circle.radius[rid] <= 5) {
// 			repulsors[i].destroy();
// 			continue;
// 		}

// 		for (let j = bodies.length - 1; j >= 0; j--) {
// 			const bid = bodies[j];
// 			if (rid === bid) continue;

// 			const dx = position.x[bid] - position.x[rid];
// 			const dy = position.y[bid] - position.y[rid];
// 			const distanceSquared = dx * dx + dy * dy;

// 			if (distanceSquared < circle.radius[rid] * circle.radius[rid]) {
// 				const distance = Math.sqrt(distanceSquared);
// 				const forceMagnitude = (repulse.force[rid] * (circle.radius[rid] - distance)) / circle.radius[rid]; // prettier-ignore
// 				const forceX = (dx / distance) * forceMagnitude;
// 				const forceY = (dy / distance) * forceMagnitude;

// 				velocity.x[bid] += (forceX * delta) / mass.value[bid];
// 				velocity.y[bid] += (forceY * delta) / mass.value[bid];
// 			}
// 		}
// 	}
// };
