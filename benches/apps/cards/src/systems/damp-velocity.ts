import { Not, type World } from 'koota';
import { Dragging, Time, Velocity } from '../traits';
import { dampedLerp } from '../utils/lerp';

const VELOCITY_DAMPING = 1 - Math.pow(0.0001, 1 / 60); // faster damping

export function dampVelocity(world: World) {
	const { delta } = world.get(Time)!;

	world.query(Velocity, Not(Dragging)).updateEach(([velocity]) => {
		// Damp velocity toward zero for smooth settling
		velocity.x = dampedLerp(velocity.x, 0, VELOCITY_DAMPING, delta);
		velocity.y = dampedLerp(velocity.y, 0, VELOCITY_DAMPING, delta);
	});
}
