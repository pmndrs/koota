import { Circle, Color, Explosion, Mass, Position, Time, Velocity } from '../components';

const explosionBody = [Explosion, Position, Circle];
const body = [Position, Velocity, Mass];

export const handleExplosions = ({ world }: { world: Koota.World }) => {
	const explosionEnts = world.query(...explosionBody);
	if (explosionEnts.length === 0) return;

	const bodyEnts = world.query(...body);
	const [position, velocity, mass, explosion, circle] = world.get(Position, Velocity, Mass, Explosion, Circle); // prettier-ignore
	const { delta } = world.resources.get(Time);

	for (let i = explosionEnts.length - 1; i >= 0; i--) {
		const e = explosionEnts[i];
		// Decay the circle radius by the explosion decay
		circle.radius[e] -= circle.radius[e] * explosion.decay[e] * delta;

		if (circle.radius[e] <= 5) {
			world.destroy(e);
			continue;
		}

		for (let j = bodyEnts.length - 1; j >= 0; j--) {
			const be = bodyEnts[j];
			if (e === be) continue;

			const dx = position.x[be] - position.x[e];
			const dy = position.y[be] - position.y[e];
			const distanceSquared = dx * dx + dy * dy;

			if (distanceSquared < circle.radius[e] * circle.radius[e]) {
				const distance = Math.sqrt(distanceSquared);
				const forceMagnitude = (explosion.force[e] * (circle.radius[e] - distance)) / circle.radius[e]; // prettier-ignore
				const forceX = (dx / distance) * forceMagnitude;
				const forceY = (dy / distance) * forceMagnitude;

				velocity.x[be] += (forceX * delta) / mass.value[be];
				velocity.y[be] += (forceY * delta) / mass.value[be];
			}
		}
	}
};
