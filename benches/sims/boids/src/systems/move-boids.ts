import type { World } from 'koota';
import { Position, Time, Velocity } from '../traits';
import { CONFIG } from '../config';

export const moveBoids = ({ world }: { world: World }) => {
	const { delta } = world.get(Time)!;
	const { maxVelocity } = CONFIG;

	world.query(Position, Velocity).updateEach(([position, velocity]) => {
		// Clamp velocity magnitude
		const speed = Math.sqrt(velocity.x ** 2 + velocity.y ** 2 + velocity.z ** 2);
		if (speed > maxVelocity) {
			const scale = maxVelocity / speed;
			velocity.x *= scale;
			velocity.y *= scale;
			velocity.z *= scale;
		}

		// Add velocity to position
		position.x += velocity.x * delta;
		position.y += velocity.y * delta;
		position.z += velocity.z * delta;
	});
};
