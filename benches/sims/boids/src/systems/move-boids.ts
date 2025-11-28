import type { World } from 'koota';
import { Position, Time, Velocity } from '../traits';
import { CONFIG } from '../config';

export const moveBoids = ({ world }: { world: World }) => {
	const { delta } = world.get(Time)!;
	const { maxVelocity, minVelocity } = CONFIG;

	world.query(Position, Velocity).updateEach(([position, velocity]) => {
		// Clamp velocity magnitude
		const speedSq = velocity.x ** 2 + velocity.y ** 2 + velocity.z ** 2;
		const speed = Math.sqrt(speedSq);

		if (speed > maxVelocity) {
			const scale = maxVelocity / speed;
			velocity.x *= scale;
			velocity.y *= scale;
			velocity.z *= scale;
		} else if (speed < minVelocity && speed > 0) {
			const scale = minVelocity / speed;
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
