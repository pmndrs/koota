import type { World } from 'koota';
import { Position, Time, Velocity } from '../traits';
import { CONFIG } from '../config';

export const moveBoids = ({ world }: { world: World }) => {
	const { delta } = world.get(Time)!;

	world.query(Position, Velocity).updateEach(([position, velocity]) => {
		// Constrain the max velocity
		velocity.x = Math.min(velocity.x, CONFIG.maxVelocity);
		velocity.y = Math.min(velocity.y, CONFIG.maxVelocity);
		velocity.z = Math.min(velocity.z, CONFIG.maxVelocity);

		// Add velocity to position
		position.x += velocity.x * delta;
		position.y += velocity.y * delta;
		position.z += velocity.z * delta;
	});
};
